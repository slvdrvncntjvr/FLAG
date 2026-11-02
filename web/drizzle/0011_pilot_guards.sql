-- SDD 2.30: exact operation-specific guards. Views are derived predicates, never bypass flags.
CREATE VIEW pilot_live_staff AS SELECT u.id,u.role FROM user u WHERE u.banned=0 AND u.deactivated_at IS NULL AND u.role IN ('admin','moderator') AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.user_id=u.id AND p.policy='privacy' AND p.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=p.policy) AND p.retired_at IS NULL) AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.user_id=u.id AND p.policy='terms' AND p.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=p.policy) AND p.retired_at IS NULL);
--> statement-breakpoint
CREATE VIEW pilot_review_actor AS SELECT c.id AS case_id,s.id AS reviewer_id FROM moderation_case c JOIN pilot_live_staff s ON s.id=c.claimed_by AND s.role='moderator' WHERE c.status='claimed' AND c.claimed_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ((c.kind='verification' AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=c.subject_id AND v.freelancer_id!=s.id)) OR EXISTS(SELECT 1 FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id WHERE l.id=c.log_id AND s.id!=l.freelancer_id AND s.id!=cp.user_id AND NOT EXISTS(SELECT 1 FROM engagement e WHERE e.freelancer_id=s.id AND e.client_id=l.client_id AND (e.status='accepted' OR e.accepted_at IS NOT NULL)) AND (c.kind!='correction' OR (NOT EXISTS(SELECT 1 FROM moderation_case publication WHERE publication.kind='log' AND publication.log_id=l.id AND publication.decision='approve' AND publication.decided_by=s.id) AND NOT EXISTS(SELECT 1 FROM review_round rr JOIN moderation_case initial ON initial.id=rr.case_id WHERE initial.kind='log' AND initial.log_id=l.id AND rr.decision='approve' AND rr.reviewer_id=s.id)))));
--> statement-breakpoint
-- Content clocks are shared by issue, claim and destructive-use predicates.
-- Pending review is never an abandoned draft; proof upload time is not rejection time.
CREATE VIEW pilot_case_content_clock AS
SELECT c.id AS case_id,
 CASE WHEN c.status IN ('open','awaiting_changes') AND c.kind='correction'
       AND q.status IN ('draft','ask_changes') THEN strftime('%Y-%m-%dT%H:%M:%fZ',q.updated_at,'+30 days')
 WHEN c.status IN ('open','awaiting_changes') AND c.kind IN ('log','filer_update')
       AND NOT EXISTS(SELECT 1 FROM log_revision pending WHERE pending.moderation_case_id=c.id AND pending.state='submitted' AND pending.decision IS NULL)
       AND (c.status='awaiting_changes' OR EXISTS(SELECT 1 FROM log_revision draft WHERE draft.moderation_case_id=c.id AND draft.state='draft' AND draft.decision IS NULL))
 THEN strftime('%Y-%m-%dT%H:%M:%fZ',max(coalesce((SELECT max(coalesce(r.draft_updated_at,r.submitted_at)) FROM log_revision r WHERE r.moderation_case_id=c.id),c.created_at),coalesce(CASE WHEN c.kind='log' THEN l.draft_updated_at END,c.created_at)),'+30 days')
 END AS close_due_at
FROM moderation_case c LEFT JOIN engagement_log l ON l.id=c.log_id LEFT JOIN correction_request q ON q.id=c.correction_request_id;
--> statement-breakpoint
CREATE VIEW pilot_revision_retention AS
SELECT id,log_id,CASE WHEN publication_due IS NOT NULL AND own_due IS NOT NULL THEN min(publication_due,own_due) ELSE coalesce(publication_due,own_due) END AS purge_due_at
FROM (SELECT r.id,r.log_id,CASE WHEN l.published_at IS NULL AND l.status='draft' AND l.first_submitted_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(l.draft_updated_at,l.created_at),'+30 days') ELSE l.expires_at END AS publication_due,
 CASE WHEN r.decision='reject' THEN strftime('%Y-%m-%dT%H:%M:%fZ',r.decided_at,'+30 days')
 WHEN r.state='draft' THEN strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(r.draft_updated_at,r.submitted_at),'+30 days')
 WHEN r.decision='ask_changes' AND c.closed_at IS NOT NULL THEN CASE WHEN c.closure_kind='abandoned' THEN c.closed_at ELSE strftime('%Y-%m-%dT%H:%M:%fZ',c.closed_at,'+30 days') END
 WHEN r.decision='ask_changes' THEN clock.close_due_at
 END AS own_due
 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id LEFT JOIN moderation_case c ON c.id=r.moderation_case_id LEFT JOIN pilot_case_content_clock clock ON clock.case_id=c.id);
--> statement-breakpoint
CREATE VIEW pilot_proof_retention AS
SELECT id,CASE WHEN publication_due IS NOT NULL AND own_due IS NOT NULL THEN min(publication_due,own_due) ELSE coalesce(publication_due,own_due) END AS purge_due_at
FROM (SELECT p.id,CASE WHEN l.published_at IS NULL AND l.status='draft' AND l.first_submitted_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(l.draft_updated_at,l.created_at),'+30 days') ELSE l.expires_at END AS publication_due,
 CASE WHEN count(link.revision_id)>0 THEN CASE WHEN count(r.purge_due_at)=count(link.revision_id) THEN max(r.purge_due_at) END
 WHEN p.correction_request_id IS NOT NULL THEN CASE WHEN q.status IN ('draft','ask_changes') THEN strftime('%Y-%m-%dT%H:%M:%fZ',q.updated_at,'+30 days') END
 ELSE strftime('%Y-%m-%dT%H:%M:%fZ',p.uploaded_at,'+30 days') END AS own_due
 FROM proof_file p JOIN engagement_log l ON l.id=p.log_id LEFT JOIN correction_request q ON q.id=p.correction_request_id
 LEFT JOIN (SELECT proof_id,revision_id FROM revision_proof UNION SELECT id,revision_id FROM proof_file WHERE revision_id IS NOT NULL) link ON link.proof_id=p.id
 LEFT JOIN pilot_revision_retention r ON r.id=link.revision_id GROUP BY p.id);
--> statement-breakpoint
CREATE VIEW pilot_target_0 AS SELECT 'engagement_log' AS target_type,id AS target_id,CASE WHEN published_at IS NOT NULL THEN expires_at WHEN status='rejected' THEN strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT max(c.closed_at) FROM moderation_case c WHERE c.log_id=engagement_log.id),'+30 days') WHEN status IN ('draft','ask_changes') THEN strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(draft_updated_at,submitted_at,created_at),'+30 days') END AS purge_due_at,NULL AS close_due_at,'log' AS hold_type,id AS log_id FROM engagement_log
UNION ALL
SELECT 'log_revision',id,purge_due_at,NULL,'revision',log_id FROM pilot_revision_retention
UNION ALL
SELECT 'proof_file',p.id,d.purge_due_at,NULL,'proof',p.log_id FROM proof_file p JOIN pilot_proof_retention d ON d.id=p.id
UNION ALL
SELECT 'moderation_case',c.id,(strftime('%Y-%m-',c.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',c.closed_at) AS INTEGER),CAST(strftime('%d',c.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(c.closed_at,11)),clock.close_due_at,'case',c.log_id FROM moderation_case c JOIN pilot_case_content_clock clock ON clock.case_id=c.id
UNION ALL
SELECT 'verification_case' AS target_type,id AS target_id,(SELECT (strftime('%Y-%m-',c.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',c.closed_at) AS INTEGER),CAST(strftime('%d',c.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(c.closed_at,11)) FROM moderation_case c WHERE c.kind='verification' AND c.subject_id=verification_case.id) AS purge_due_at,NULL AS close_due_at,'case' AS hold_type,NULL AS log_id FROM verification_case;
--> statement-breakpoint
CREATE VIEW pilot_target_1 AS SELECT 'review_round' AS target_type,id AS target_id,(SELECT (strftime('%Y-%m-',c.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',c.closed_at) AS INTEGER),CAST(strftime('%d',c.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(c.closed_at,11)) FROM moderation_case c WHERE c.id=review_round.case_id) AS purge_due_at,NULL AS close_due_at,'case' AS hold_type,(SELECT c.log_id FROM moderation_case c WHERE c.id=review_round.case_id) AS log_id FROM review_round
UNION ALL
SELECT 'proof_review' AS target_type,id AS target_id,(SELECT (strftime('%Y-%m-',c.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',c.closed_at) AS INTEGER),CAST(strftime('%d',c.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(c.closed_at,11)) FROM review_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE rr.id=proof_review.round_id) AS purge_due_at,NULL AS close_due_at,'case' AS hold_type,NULL AS log_id FROM proof_review
UNION ALL
SELECT 'correction_request' AS target_type,id AS target_id,(strftime('%Y-%m-',closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',closed_at) AS INTEGER),CAST(strftime('%d',closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(closed_at,11)) AS purge_due_at,CASE WHEN status IN ('draft','ask_changes') THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+30 days') END AS close_due_at,'case' AS hold_type,log_id AS log_id FROM correction_request
UNION ALL
SELECT 'privacy_request' AS target_type,id AS target_id,(strftime('%Y-%m-',closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',closed_at) AS INTEGER),CAST(strftime('%d',closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(closed_at,11)) AS purge_due_at,NULL AS close_due_at,'request' AS hold_type,NULL AS log_id FROM privacy_request
UNION ALL
SELECT 'audit_event' AS target_type,id AS target_id,CASE WHEN moderation_case_id IS NOT NULL THEN (SELECT (strftime('%Y-%m-',c.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',c.closed_at) AS INTEGER),CAST(strftime('%d',c.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(c.closed_at,11)) FROM moderation_case c WHERE c.id=audit_event.moderation_case_id) ELSE retain_until END AS purge_due_at,NULL AS close_due_at,'audit' AS hold_type,NULL AS log_id FROM audit_event;
--> statement-breakpoint
CREATE VIEW pilot_target_2 AS SELECT 'policy_acceptance' AS target_type,id AS target_id,(strftime('%Y-%m-',retired_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',retired_at) AS INTEGER),CAST(strftime('%d',retired_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(retired_at,11)) AS purge_due_at,NULL AS close_due_at,'policy' AS hold_type,NULL AS log_id FROM policy_acceptance
UNION ALL
SELECT 'engagement_consent' AS target_type,engagement_id AS target_id,(SELECT (strftime('%Y-%m-',e.purpose_ended_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',e.purpose_ended_at) AS INTEGER),CAST(strftime('%d',e.purpose_ended_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(e.purpose_ended_at,11)) FROM engagement e WHERE e.id=engagement_consent.engagement_id) AS purge_due_at,NULL AS close_due_at,'policy' AS hold_type,NULL AS log_id FROM engagement_consent
UNION ALL
SELECT 'retention_hold' AS target_type,id AS target_id,(strftime('%Y-%m-',coalesce(released_at,expires_at),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',coalesce(released_at,expires_at)) AS INTEGER),CAST(strftime('%d',coalesce(released_at,expires_at),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(coalesce(released_at,expires_at),11)) AS purge_due_at,NULL AS close_due_at,'retention_hold' AS hold_type,NULL AS log_id FROM retention_hold
UNION ALL
SELECT 'export_delivery',d.id,CASE WHEN d.write_inflight=1 THEN NULL WHEN d.purged_at IS NULL THEN coalesce(d.downloaded_at,CASE WHEN d.token_hash IS NULL THEN d.created_at END,d.expires_at)
 ELSE (SELECT (strftime('%Y-%m-',p.closed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',p.closed_at) AS INTEGER),CAST(strftime('%d',p.closed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(p.closed_at,11)) FROM privacy_request p WHERE p.id=d.privacy_request_id) END,NULL,'export_delivery',NULL FROM export_delivery d
UNION ALL
SELECT 'maintenance_task' AS target_type,id AS target_id,retain_until AS purge_due_at,NULL AS close_due_at,'maintenance_task' AS hold_type,NULL AS log_id FROM maintenance_task;
--> statement-breakpoint
CREATE VIEW pilot_target_3 AS SELECT 'backup_disposition' AS target_type,id AS target_id,(strftime('%Y-%m-',verified_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',verified_at) AS INTEGER),CAST(strftime('%d',verified_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(verified_at,11)) AS purge_due_at,NULL AS close_due_at,'backup_disposition' AS hold_type,NULL AS log_id FROM backup_disposition
UNION ALL
SELECT 'user' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'user' AS hold_type,NULL AS log_id FROM user
UNION ALL
SELECT 'session' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'session' AS hold_type,NULL AS log_id FROM session
UNION ALL
SELECT 'account' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'account' AS hold_type,NULL AS log_id FROM account
UNION ALL
SELECT 'auth_verification' AS target_type,id AS target_id,expires_at AS purge_due_at,NULL AS close_due_at,'auth_verification' AS hold_type,NULL AS log_id FROM auth_verification;
--> statement-breakpoint
CREATE VIEW pilot_target_4 AS SELECT 'freelancer_profile' AS target_type,user_id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'freelancer_profile' AS hold_type,NULL AS log_id FROM freelancer_profile
UNION ALL
SELECT 'client_profile' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'client_profile' AS hold_type,NULL AS log_id FROM client_profile
UNION ALL
SELECT 'portfolio_link' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'portfolio_link' AS hold_type,NULL AS log_id FROM portfolio_link
UNION ALL
SELECT 'engagement' AS target_type,id AS target_id,NULL AS purge_due_at,NULL AS close_due_at,'engagement' AS hold_type,NULL AS log_id FROM engagement;
--> statement-breakpoint
CREATE VIEW pilot_maintenance_target AS SELECT * FROM (SELECT * FROM pilot_target_0 LIMIT -1)
UNION ALL
SELECT * FROM (SELECT * FROM pilot_target_1 LIMIT -1)
UNION ALL
SELECT * FROM (SELECT * FROM pilot_target_2 LIMIT -1)
UNION ALL
SELECT * FROM (SELECT * FROM pilot_target_3 LIMIT -1)
UNION ALL
SELECT * FROM (SELECT * FROM pilot_target_4 LIMIT -1);
--> statement-breakpoint
CREATE VIEW pilot_unheld_target AS SELECT x.* FROM pilot_maintenance_target x WHERE NOT EXISTS(SELECT 1 FROM retention_hold h WHERE h.released_at IS NULL AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ((h.target_type=x.hold_type AND h.target_id=x.target_id) OR (x.target_type IN ('log_revision','proof_file') AND h.target_type='log' AND h.target_id=x.log_id))) AND NOT EXISTS(SELECT 1 FROM engagement_log l WHERE (l.id=x.log_id OR x.target_type='engagement_log' AND l.id=x.target_id) AND l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at<l.hold_placed_at));
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key_0 AS
SELECT 'user' AS target_type,id AS target_id,'user' AS binding_type,id AS binding_id FROM user k
UNION ALL SELECT 'session' AS target_type,id AS target_id,'user' AS binding_type,user_id AS binding_id FROM session k
UNION ALL SELECT 'account' AS target_type,id AS target_id,'user' AS binding_type,user_id AS binding_id FROM account k
UNION ALL SELECT 'auth_verification' AS target_type,id AS target_id,'user' AS binding_type,(SELECT u.id FROM user u WHERE k.identifier IN ('sign-in-otp-'||u.email,'email-verification-otp-'||u.email,'forget-password-otp-'||u.email,'change-email-otp-'||u.email)) AS binding_id FROM auth_verification k
UNION ALL SELECT 'freelancer_profile' AS target_type,user_id AS target_id,'user' AS binding_type,user_id AS binding_id FROM freelancer_profile k;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key_1 AS
SELECT 'client_profile' AS target_type,id AS target_id,'user' AS binding_type,user_id AS binding_id FROM client_profile k
UNION ALL SELECT 'portfolio_link' AS target_type,id AS target_id,'user' AS binding_type,freelancer_id AS binding_id FROM portfolio_link k
UNION ALL SELECT 'engagement' AS target_type,id AS target_id,'engagement' AS binding_type,id AS binding_id FROM engagement k
UNION ALL SELECT 'engagement_log' AS target_type,id AS target_id,'log' AS binding_type,id AS binding_id FROM engagement_log k
UNION ALL SELECT 'log_revision' AS target_type,id AS target_id,'log' AS binding_type,log_id AS binding_id FROM log_revision k;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key_2 AS
SELECT 'proof_file' AS target_type,id AS target_id,'log' AS binding_type,log_id AS binding_id FROM proof_file k
UNION ALL SELECT 'verification_case' AS target_type,id AS target_id,'verification' AS binding_type,id AS binding_id FROM verification_case k
UNION ALL SELECT 'moderation_case' AS target_type,id AS target_id,'case' AS binding_type,id AS binding_id FROM moderation_case k
UNION ALL SELECT 'correction_request' AS target_type,id AS target_id,'correction' AS binding_type,id AS binding_id FROM correction_request k
UNION ALL SELECT 'review_round' AS target_type,id AS target_id,'case' AS binding_type,case_id AS binding_id FROM review_round k;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key_3 AS
SELECT 'proof_review' AS target_type,id AS target_id,'case' AS binding_type,(SELECT rr.case_id FROM review_round rr WHERE rr.id=k.round_id) AS binding_id FROM proof_review k
UNION ALL SELECT 'audit_event' AS target_type,id AS target_id,'audit' AS binding_type,id AS binding_id FROM audit_event k
UNION ALL SELECT 'policy_acceptance' AS target_type,id AS target_id,'user' AS binding_type,user_id AS binding_id FROM policy_acceptance k
UNION ALL SELECT 'engagement_consent' AS target_type,engagement_id AS target_id,'engagement' AS binding_type,engagement_id AS binding_id FROM engagement_consent k
UNION ALL SELECT 'privacy_request' AS target_type,id AS target_id,'user' AS binding_type,subject_user_id AS binding_id FROM privacy_request k;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key_4 AS
SELECT 'export_delivery' AS target_type,id AS target_id,'user' AS binding_type,(SELECT p.subject_user_id FROM privacy_request p WHERE p.id=k.privacy_request_id) AS binding_id FROM export_delivery k
UNION ALL SELECT 'maintenance_task' AS target_type,id AS target_id,'user' AS binding_type,(SELECT p.subject_user_id FROM privacy_request p WHERE p.id=k.privacy_request_id) AS binding_id FROM maintenance_task k
UNION ALL SELECT 'backup_disposition' AS target_type,id AS target_id,'user' AS binding_type,(SELECT p.subject_user_id FROM privacy_request p WHERE p.id=k.privacy_request_id) AS binding_id FROM backup_disposition k
UNION ALL SELECT 'retention_hold',h.id,CASE h.target_type WHEN 'user' THEN 'user' WHEN 'policy' THEN 'user' WHEN 'request' THEN 'user' WHEN 'revision' THEN 'log' WHEN 'proof' THEN 'log' ELSE h.target_type END,
 CASE h.target_type WHEN 'policy' THEN (SELECT user_id FROM policy_acceptance WHERE id=h.target_id) WHEN 'request' THEN (SELECT subject_user_id FROM privacy_request WHERE id=h.target_id) WHEN 'revision' THEN (SELECT log_id FROM log_revision WHERE id=h.target_id) WHEN 'proof' THEN (SELECT log_id FROM proof_file WHERE id=h.target_id) ELSE h.target_id END FROM retention_hold h;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_key AS
SELECT * FROM (SELECT * FROM pilot_privacy_subject_key_0 LIMIT -1)
UNION ALL SELECT * FROM (SELECT * FROM pilot_privacy_subject_key_1 LIMIT -1)
UNION ALL SELECT * FROM (SELECT * FROM pilot_privacy_subject_key_2 LIMIT -1)
UNION ALL SELECT * FROM (SELECT * FROM pilot_privacy_subject_key_3 LIMIT -1)
UNION ALL SELECT * FROM (SELECT * FROM pilot_privacy_subject_key_4 LIMIT -1);
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_target AS
SELECT k.target_type,k.target_id,subject.value AS subject_user_id FROM (SELECT * FROM pilot_privacy_subject_key LIMIT -1) k,
json_each(CASE k.binding_type
 WHEN 'user' THEN json_array(k.binding_id)
 WHEN 'log' THEN json_array((SELECT freelancer_id FROM engagement_log WHERE id=k.binding_id),(SELECT cp.user_id FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id WHERE l.id=k.binding_id))
 WHEN 'engagement' THEN json_array((SELECT freelancer_id FROM engagement WHERE id=k.binding_id),(SELECT cp.user_id FROM engagement e JOIN client_profile cp ON cp.id=e.client_id WHERE e.id=k.binding_id))
 WHEN 'verification' THEN json_array((SELECT freelancer_id FROM verification_case WHERE id=k.binding_id))
 WHEN 'correction' THEN json_array((SELECT requested_by FROM correction_request WHERE id=k.binding_id),(SELECT l.freelancer_id FROM correction_request q JOIN engagement_log l ON l.id=q.log_id WHERE q.id=k.binding_id),(SELECT cp.user_id FROM correction_request q JOIN engagement_log l ON l.id=q.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE q.id=k.binding_id))
 WHEN 'case' THEN json_array((SELECT l.freelancer_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id WHERE c.id=k.binding_id),(SELECT cp.user_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE c.id=k.binding_id),(SELECT v.freelancer_id FROM moderation_case c JOIN verification_case v ON c.kind='verification' AND v.id=c.subject_id WHERE c.id=k.binding_id),(SELECT q.requested_by FROM moderation_case c JOIN correction_request q ON q.id=c.correction_request_id WHERE c.id=k.binding_id))
 WHEN 'audit' THEN json_insert(json_array((SELECT l.freelancer_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT cp.user_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT v.freelancer_id FROM moderation_case c JOIN verification_case v ON c.kind='verification' AND v.id=c.subject_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT q.requested_by FROM moderation_case c JOIN correction_request q ON q.id=c.correction_request_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id))),'$[#]',(SELECT actor_id FROM audit_event WHERE id=k.binding_id))
 ELSE '[]' END) subject WHERE subject.type='text';
--> statement-breakpoint
CREATE VIEW pilot_assessed_source_deadline AS
SELECT json_extract(a.value,'$.targetType') AS target_type,json_extract(a.value,'$.targetId') AS target_id,
 p.subject_user_id,min(json_extract(a.value,'$.dueAt')) AS due_at
FROM privacy_request p JOIN pilot_live_staff staff ON staff.id=p.responsible_id AND staff.role='admin',
 json_each(p.scope,'$.targets') s,json_each(p.assessment,'$.targets') a
WHERE p.status IN ('assessing','executing','deferred') AND p.identity_verified_at IS NOT NULL AND p.assessed_at IS NOT NULL
 AND json_extract(a.value,'$.operation') IN ('purge','redact_identity') AND json_extract(a.value,'$.basis') IN ('assessed_erasure','account_closure')
 AND julianday(json_extract(a.value,'$.dueAt')) IS NOT NULL
 AND json_extract(s.value,'$.targetType')=json_extract(a.value,'$.targetType')
 AND json_extract(s.value,'$.targetId')=json_extract(a.value,'$.targetId')
 AND json_extract(s.value,'$.operation')=json_extract(a.value,'$.operation') AND json_extract(s.value,'$.dueAt')=json_extract(a.value,'$.dueAt')
 AND NOT EXISTS(SELECT 1 FROM maintenance_task done WHERE done.privacy_request_id=p.id AND done.status='completed'
   AND done.target_type=json_extract(a.value,'$.targetType') AND done.target_id=json_extract(a.value,'$.targetId')
   AND done.operation=json_extract(a.value,'$.operation') AND done.due_at=json_extract(a.value,'$.dueAt') AND done.basis=json_extract(a.value,'$.basis'))
 AND EXISTS(SELECT 1 FROM pilot_privacy_subject_target owner WHERE owner.subject_user_id=p.subject_user_id
   AND owner.target_type=json_extract(a.value,'$.targetType') AND owner.target_id=json_extract(a.value,'$.targetId'))
GROUP BY json_extract(a.value,'$.targetType'),json_extract(a.value,'$.targetId'),p.subject_user_id;
--> statement-breakpoint
CREATE VIEW pilot_maintenance_eligible AS SELECT t.* FROM maintenance_task t JOIN pilot_unheld_target x ON x.target_type=t.target_type AND x.target_id=t.target_id WHERE (t.status='claimed' OR t.authorization_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND t.due_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (
 (t.authorized_by IS NULL AND t.privacy_request_id IS NULL AND t.basis='retention_due' AND ((t.operation='purge' AND x.purge_due_at IS NOT NULL AND (t.due_at=x.purge_due_at OR t.status='claimed' AND x.target_type='export_delivery' AND EXISTS(SELECT 1 FROM export_delivery d WHERE d.id=x.target_id AND d.purged_at IS NULL) AND t.due_at>=x.purge_due_at)) OR (t.operation='close_abandoned' AND x.close_due_at IS NOT NULL AND t.due_at=x.close_due_at)))
 OR (t.authorized_by IS NOT NULL AND t.basis IN ('assessed_erasure','account_closure') AND EXISTS(
 SELECT 1 FROM privacy_request p JOIN pilot_live_staff a ON a.id=p.responsible_id AND a.role='admin', json_each(p.scope,'$.targets') sc,json_each(p.assessment,'$.targets') ac
 WHERE p.id=t.privacy_request_id AND p.responsible_id=t.authorized_by AND p.identity_verified_at IS NOT NULL AND p.assessed_at IS NOT NULL AND p.status IN ('executing','deferred')
 AND EXISTS(SELECT 1 FROM pilot_privacy_subject_target subject WHERE subject.target_type=t.target_type AND subject.target_id=t.target_id AND subject.subject_user_id=p.subject_user_id)
 AND json_extract(sc.value,'$.targetType')=t.target_type AND json_extract(sc.value,'$.targetId')=t.target_id AND json_extract(sc.value,'$.operation')=t.operation AND json_extract(sc.value,'$.dueAt')=t.due_at
 AND json_extract(ac.value,'$.targetType')=t.target_type AND json_extract(ac.value,'$.targetId')=t.target_id AND json_extract(ac.value,'$.operation')=t.operation AND json_extract(ac.value,'$.dueAt')=t.due_at AND json_extract(ac.value,'$.basis')=t.basis
 AND (t.basis!='account_closure' OR p.kind='closure')
 )));
--> statement-breakpoint
CREATE TRIGGER maintenance_issue AFTER INSERT ON maintenance_task BEGIN
SELECT CASE WHEN (NEW.status!='planned' OR NEW.claimed_at IS NOT NULL OR NEW.attempts!=0 OR NEW.completed_at IS NOT NULL OR NEW.retain_until IS NOT NULL OR abs((julianday(NEW.authorized_at)-julianday('now'))*86400)>60 OR NEW.authorization_expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN RAISE(ABORT,'invalid task issuance') END;SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.id=NEW.id)) THEN RAISE(ABORT,'unassessed or not-due maintenance task') END;
END;
--> statement-breakpoint
CREATE TRIGGER maintenance_update BEFORE UPDATE ON maintenance_task BEGIN
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.privacy_request_id IS NOT OLD.privacy_request_id OR NEW.authorized_by IS NOT OLD.authorized_by OR NEW.target_type IS NOT OLD.target_type OR NEW.target_id IS NOT OLD.target_id OR NEW.operation IS NOT OLD.operation OR NEW.basis IS NOT OLD.basis OR NEW.due_at IS NOT OLD.due_at OR NEW.authorized_at IS NOT OLD.authorized_at OR NEW.authorization_expires_at IS NOT OLD.authorization_expires_at) THEN RAISE(ABORT,'maintenance grant is immutable') END;SELECT CASE WHEN (NOT ((OLD.status='planned' AND NEW.status='claimed' AND NEW.attempts=OLD.attempts+1 AND NEW.claimed_at IS NOT NULL AND abs((julianday(NEW.claimed_at)-julianday('now'))*86400)<=60 AND OLD.authorization_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND NEW.completed_at IS NULL AND NEW.retain_until IS NULL) OR (OLD.status='claimed' AND NEW.status='blocked' AND NEW.attempts=OLD.attempts AND NEW.claimed_at IS OLD.claimed_at AND NEW.completed_at IS NULL AND NEW.retain_until IS NULL) OR (OLD.status='blocked' AND NEW.status='planned' AND NEW.attempts=OLD.attempts AND NEW.claimed_at IS NULL AND NEW.completed_at IS NULL AND NEW.retain_until IS NULL AND NEW.authorization_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR (OLD.status IN ('planned','blocked') AND NEW.status='abandoned' AND OLD.authorization_expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND NEW.attempts=OLD.attempts AND NEW.claimed_at IS OLD.claimed_at AND abs((julianday(NEW.completed_at)-julianday('now'))*86400)<=60 AND NEW.retain_until IS (strftime('%Y-%m-',NEW.completed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',NEW.completed_at) AS INTEGER),CAST(strftime('%d',NEW.completed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(NEW.completed_at,11))) OR (OLD.status='claimed' AND NEW.status='completed' AND NEW.attempts=OLD.attempts AND NEW.claimed_at IS OLD.claimed_at AND NEW.completed_at IS NOT NULL AND abs((julianday(NEW.completed_at)-julianday('now'))*86400)<=60 AND NEW.retain_until IS (strftime('%Y-%m-',NEW.completed_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',NEW.completed_at) AS INTEGER),CAST(strftime('%d',NEW.completed_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(NEW.completed_at,11))))) THEN RAISE(ABORT,'invalid maintenance task transition') END;
END;
--> statement-breakpoint
CREATE TRIGGER maintenance_claim AFTER UPDATE ON maintenance_task WHEN NEW.status='claimed' BEGIN
SELECT CASE WHEN EXISTS(SELECT 1 FROM proof_file p WHERE p.write_inflight=1 AND
 ((NEW.target_type='proof_file' AND p.id=NEW.target_id) OR (NEW.target_type='engagement_log' AND p.log_id=NEW.target_id)
 OR (NEW.target_type='log_revision' AND (p.revision_id=NEW.target_id OR EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=NEW.target_id)))
 OR (NEW.target_type='correction_request' AND p.correction_request_id=NEW.target_id))) THEN RAISE(ABORT,'proof writer unsettled') END;
SELECT CASE WHEN NEW.target_type='export_delivery' AND EXISTS(SELECT 1 FROM export_delivery d WHERE d.id=NEW.target_id AND d.write_inflight=1) THEN RAISE(ABORT,'export writer unsettled') END;
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.id=NEW.id)) THEN RAISE(ABORT,'maintenance basis no longer valid') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_log_delete BEFORE DELETE ON engagement_log BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_log_revision_delete BEFORE DELETE ON log_revision BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='log_revision' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_proof_file_delete BEFORE DELETE ON proof_file BEGIN
SELECT CASE WHEN OLD.write_inflight=1 THEN RAISE(ABORT,'unsettled proof writer owns tracking') END;
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='proof_file' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_moderation_case_delete BEFORE DELETE ON moderation_case BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='moderation_case' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_verification_case_delete BEFORE DELETE ON verification_case BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='verification_case' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_review_round_delete BEFORE DELETE ON review_round BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='review_round' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_proof_review_delete BEFORE DELETE ON proof_review BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='proof_review' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_correction_request_delete BEFORE DELETE ON correction_request BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='correction_request' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_privacy_request_delete BEFORE DELETE ON privacy_request BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='privacy_request' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_audit_event_delete BEFORE DELETE ON audit_event BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='audit_event' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_policy_acceptance_delete BEFORE DELETE ON policy_acceptance BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='policy_acceptance' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_consent_delete BEFORE DELETE ON engagement_consent BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='engagement_consent' AND m.target_id=OLD.engagement_id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_retention_hold_delete BEFORE DELETE ON retention_hold BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='retention_hold' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_export_delivery_delete BEFORE DELETE ON export_delivery BEGIN
SELECT CASE WHEN OLD.write_inflight=1 THEN RAISE(ABORT,'export writer unsettled') END;
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='export_delivery' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_maintenance_task_delete BEFORE DELETE ON maintenance_task BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='maintenance_task' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_backup_disposition_delete BEFORE DELETE ON backup_disposition BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='backup_disposition' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_user_delete BEFORE DELETE ON user BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_freelancer_profile_delete BEFORE DELETE ON freelancer_profile BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='freelancer_profile' AND m.target_id=OLD.user_id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_client_profile_delete BEFORE DELETE ON client_profile BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='client_profile' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_portfolio_link_delete BEFORE DELETE ON portfolio_link BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_delete BEFORE DELETE ON engagement BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='engagement' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact claimed purge task required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_session_insert BEFORE INSERT ON session BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.user_id AND u.deactivated_at IS NOT NULL)) THEN RAISE(ABORT,'deactivated credentials denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_session_update BEFORE UPDATE ON session BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.user_id AND u.deactivated_at IS NOT NULL)) THEN RAISE(ABORT,'deactivated credentials denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_account_insert BEFORE INSERT ON account BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.user_id AND u.deactivated_at IS NOT NULL)) THEN RAISE(ABORT,'deactivated credentials denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_account_update BEFORE UPDATE ON account BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.user_id AND u.deactivated_at IS NOT NULL)) THEN RAISE(ABORT,'deactivated credentials denied') END;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS unused_review_round;
--> statement-breakpoint
DROP TRIGGER IF EXISTS unused_proof_review;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_event_no_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS policy_acceptance_no_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_event_no_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS policy_acceptance_no_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS moderation_case_frozen_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_case_frozen_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS log_private_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS log_revision_private_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS log_tag_private_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS proof_private_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS engagement_consent_no_delete;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_log_consume AFTER DELETE ON engagement_log BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='engagement_log' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_log_revision_consume AFTER DELETE ON log_revision BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='log_revision' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_proof_file_consume AFTER DELETE ON proof_file BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='proof_file' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_moderation_case_consume AFTER DELETE ON moderation_case BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='moderation_case' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_verification_case_consume AFTER DELETE ON verification_case BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='verification_case' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_review_round_consume AFTER DELETE ON review_round BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='review_round' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_proof_review_consume AFTER DELETE ON proof_review BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='proof_review' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_correction_request_consume AFTER DELETE ON correction_request BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='correction_request' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_privacy_request_consume AFTER DELETE ON privacy_request BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='privacy_request' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_audit_event_consume AFTER DELETE ON audit_event BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='audit_event' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_policy_acceptance_consume AFTER DELETE ON policy_acceptance BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='policy_acceptance' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_consent_consume AFTER DELETE ON engagement_consent BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='engagement_consent' AND target_id=OLD.engagement_id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_retention_hold_consume AFTER DELETE ON retention_hold BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='retention_hold' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_export_delivery_consume AFTER DELETE ON export_delivery BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='export_delivery' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_backup_disposition_consume AFTER DELETE ON backup_disposition BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='backup_disposition' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_user_consume AFTER DELETE ON user BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='user' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_freelancer_profile_consume AFTER DELETE ON freelancer_profile BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='freelancer_profile' AND target_id=OLD.user_id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_client_profile_consume AFTER DELETE ON client_profile BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='client_profile' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_portfolio_link_consume AFTER DELETE ON portfolio_link BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='portfolio_link' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_consume AFTER DELETE ON engagement BEGIN
UPDATE maintenance_task SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11)) WHERE target_type='engagement' AND target_id=OLD.id AND operation='purge' AND status='claimed';
END;
--> statement-breakpoint
CREATE TRIGGER maintenance_operation_allowlist BEFORE INSERT ON maintenance_task BEGIN
SELECT CASE WHEN (NOT (NEW.operation='purge' OR NEW.operation='redact_identity' AND NEW.target_type IN ('user','freelancer_profile','client_profile','portfolio_link','verification_case','engagement_log') OR NEW.operation='retire_policy' AND NEW.target_type IN ('policy_acceptance','engagement') OR NEW.operation='close_abandoned' AND NEW.target_type IN ('moderation_case','correction_request'))) THEN RAISE(ABORT,'operation not supported for target') END;
END;
--> statement-breakpoint
CREATE TRIGGER review_round_frozen BEFORE UPDATE ON review_round BEGIN
SELECT CASE WHEN (NOT (NEW.revision_id IS NULL AND OLD.revision_id IS NOT NULL AND NEW.id IS OLD.id AND NEW.case_id IS OLD.case_id AND NEW.round_no IS OLD.round_no AND NEW.reviewer_id IS OLD.reviewer_id AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_at IS OLD.decided_at AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='log_revision' AND m.target_id=OLD.revision_id AND m.operation='purge'))) THEN RAISE(ABORT,'review round is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_review_frozen BEFORE UPDATE ON proof_review BEGIN
SELECT CASE WHEN (NOT (NEW.proof_id IS NULL AND OLD.proof_id IS NOT NULL AND NEW.id IS OLD.id AND NEW.round_id IS OLD.round_id AND NEW.proof_sha256 IS OLD.proof_sha256 AND NEW.verdict IS OLD.verdict AND NEW.reason IS OLD.reason AND NEW.reviewed_at IS OLD.reviewed_at AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='proof_file' AND m.target_id=OLD.proof_id AND m.operation='purge'))) THEN RAISE(ABORT,'proof verdict is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER audit_frozen BEFORE UPDATE ON audit_event BEGIN
SELECT CASE WHEN (NOT ((NEW.id IS OLD.id AND NEW.action IS OLD.action AND NEW.subject_type IS OLD.subject_type AND NEW.subject_id IS OLD.subject_id AND NEW.created_at IS OLD.created_at AND NEW.moderation_case_id IS OLD.moderation_case_id AND NEW.retain_until IS OLD.retain_until AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.actor_id AND m.operation='redact_identity')) OR (NEW.id IS OLD.id AND NEW.actor_id IS OLD.actor_id AND NEW.action IS OLD.action AND NEW.subject_type IS OLD.subject_type AND NEW.subject_id IS OLD.subject_id AND NEW.created_at IS OLD.created_at AND NEW.moderation_case_id IS OLD.moderation_case_id AND OLD.retain_until IS NULL AND NEW.retain_until IS NOT NULL AND NEW.retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11))))) THEN RAISE(ABORT,'audit is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER policy_retire BEFORE UPDATE ON policy_acceptance BEGIN
SELECT CASE WHEN (NOT (NEW.id IS OLD.id AND NEW.user_id IS OLD.user_id AND NEW.policy IS OLD.policy AND NEW.version IS OLD.version AND NEW.accepted_at IS OLD.accepted_at AND OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL AND abs((julianday(NEW.retired_at)-julianday('now'))*86400)<=60 AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='policy_acceptance' AND m.target_id=OLD.id AND m.operation='retire_policy'))) THEN RAISE(ABORT,'policy evidence is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER engagement_purpose_end BEFORE UPDATE OF purpose_ended_at ON engagement BEGIN
SELECT CASE WHEN (NEW.purpose_ended_at IS NOT OLD.purpose_ended_at AND NOT (OLD.purpose_ended_at IS NULL AND NEW.purpose_ended_at IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='engagement' AND m.target_id=OLD.id AND m.operation='retire_policy'))) THEN RAISE(ABORT,'consent purpose requires assessed retirement') END;
END;
--> statement-breakpoint
CREATE TRIGGER privacy_insert BEFORE INSERT ON privacy_request BEGIN
SELECT CASE WHEN (NEW.status!='received' OR NEW.subject_user_id IS NULL OR NEW.identity_verified_at IS NOT NULL OR NEW.assessed_at IS NOT NULL OR NEW.assessment IS NOT NULL OR NEW.outcome IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.deactivated_at IS NOT NULL) THEN RAISE(ABORT,'privacy request must start received') END;SELECT CASE WHEN (NEW.responsible_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pilot_live_staff a WHERE a.id=NEW.responsible_id AND a.role='admin')) THEN RAISE(ABORT,'current privacy processor required') END;
END;
--> statement-breakpoint
CREATE TRIGGER privacy_update BEFORE UPDATE ON privacy_request BEGIN
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.received_at IS NOT OLD.received_at OR NEW.due_at IS NOT OLD.due_at) THEN RAISE(ABORT,'privacy identity is immutable') END;SELECT CASE WHEN (OLD.status IN ('completed','deferred','denied') AND NOT (NEW.id IS OLD.id AND NEW.responsible_id IS OLD.responsible_id AND NEW.kind IS OLD.kind AND NEW.received_at IS OLD.received_at AND NEW.due_at IS OLD.due_at AND NEW.identity_verified_at IS OLD.identity_verified_at AND NEW.status IS OLD.status AND NEW.scope IS OLD.scope AND NEW.assessment IS OLD.assessment AND NEW.outcome IS OLD.outcome AND NEW.deactivated_at IS OLD.deactivated_at AND NEW.assessed_at IS OLD.assessed_at AND NEW.closed_at IS OLD.closed_at AND NEW.subject_user_id IS NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.subject_user_id AND m.operation='purge'))) THEN RAISE(ABORT,'closed privacy request is immutable') END;SELECT CASE WHEN (OLD.status NOT IN ('completed','deferred','denied') AND NOT EXISTS(SELECT 1 FROM pilot_live_staff a WHERE a.id=NEW.responsible_id AND a.role='admin')) THEN RAISE(ABORT,'current privacy processor required') END;SELECT CASE WHEN (NEW.status NOT IN ('received','assessing') AND (NEW.identity_verified_at IS NULL OR NEW.assessed_at IS NULL OR NEW.assessment IS NULL OR json_type(NEW.assessment,'$.targets') IS NOT 'array' OR json_type(NEW.scope,'$.targets') IS NOT 'array')) THEN RAISE(ABORT,'verified category assessment required') END;SELECT CASE WHEN (NEW.status IN ('completed','deferred','denied') AND (NEW.closed_at IS NULL OR NEW.outcome IS NULL OR length(trim(NEW.outcome))=0)) THEN RAISE(ABORT,'private outcome required') END;SELECT CASE WHEN (NEW.status='completed' AND (EXISTS(SELECT 1 FROM maintenance_task t WHERE t.privacy_request_id=NEW.id AND t.status!='completed' AND NOT (t.status='abandoned' AND EXISTS(SELECT 1 FROM maintenance_task successor WHERE successor.privacy_request_id=t.privacy_request_id AND successor.target_type=t.target_type AND successor.target_id=t.target_id AND successor.operation=t.operation AND successor.basis=t.basis AND successor.status='completed'))) OR EXISTS(SELECT 1 FROM backup_disposition b WHERE b.privacy_request_id=NEW.id AND (b.status!='verified' OR b.action='restore_filter' AND NOT EXISTS(SELECT 1 FROM backup_disposition e WHERE e.privacy_request_id=b.privacy_request_id AND e.backup_ref=b.backup_ref AND e.target_type=b.target_type AND e.target_id=b.target_id AND e.action IN ('erase','expire') AND e.status='verified'))) OR EXISTS(SELECT 1 FROM export_delivery d WHERE d.privacy_request_id=NEW.id AND d.purged_at IS NULL))) THEN RAISE(ABORT,'unverified erasure remains outstanding') END;
END;
--> statement-breakpoint
CREATE TRIGGER hold_issue BEFORE INSERT ON retention_hold BEGIN
SELECT CASE WHEN EXISTS(SELECT 1 FROM proof_file p WHERE p.purge_inflight=1
 AND ((NEW.target_type='proof' AND NEW.target_id=p.id) OR (NEW.target_type='log' AND NEW.target_id=p.log_id)))
 THEN RAISE(ABORT,'proof purge already claimed') END;
SELECT CASE WHEN (NOT ((NEW.target_type='user' AND EXISTS(SELECT 1 FROM user WHERE id=NEW.target_id)) OR (NEW.target_type='log' AND EXISTS(SELECT 1 FROM engagement_log WHERE id=NEW.target_id)) OR (NEW.target_type='revision' AND EXISTS(SELECT 1 FROM log_revision WHERE id=NEW.target_id)) OR (NEW.target_type='proof' AND EXISTS(SELECT 1 FROM proof_file WHERE id=NEW.target_id)) OR (NEW.target_type='case' AND EXISTS(SELECT 1 FROM moderation_case WHERE id=NEW.target_id)) OR (NEW.target_type='policy' AND EXISTS(SELECT 1 FROM policy_acceptance WHERE id=NEW.target_id)) OR (NEW.target_type='request' AND EXISTS(SELECT 1 FROM privacy_request WHERE id=NEW.target_id)) OR (NEW.target_type='audit' AND EXISTS(SELECT 1 FROM audit_event WHERE id=NEW.target_id)))) THEN RAISE(ABORT,'hold target does not exist') END;SELECT CASE WHEN (NEW.released_at IS NOT NULL OR NEW.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NOT EXISTS(SELECT 1 FROM pilot_live_staff s WHERE s.id=NEW.responsible_id)) THEN RAISE(ABORT,'current bounded hold owner required') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM maintenance_task t JOIN pilot_maintenance_target x ON x.target_type=t.target_type AND x.target_id=t.target_id WHERE t.status='claimed' AND ((x.hold_type=NEW.target_type AND x.target_id=NEW.target_id) OR (NEW.target_type='log' AND x.log_id=NEW.target_id)))) THEN RAISE(ABORT,'purge already claimed') END;
END;
--> statement-breakpoint
CREATE TRIGGER hold_release BEFORE UPDATE ON retention_hold BEGIN
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.target_type IS NOT OLD.target_type OR NEW.target_id IS NOT OLD.target_id OR NEW.kind IS NOT OLD.kind OR NEW.responsible_id IS NOT OLD.responsible_id OR NEW.reason IS NOT OLD.reason OR NEW.placed_at IS NOT OLD.placed_at OR NEW.review_due_at IS NOT OLD.review_due_at OR NEW.expires_at IS NOT OLD.expires_at OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NOT EXISTS(SELECT 1 FROM pilot_live_staff s WHERE s.id=OLD.responsible_id)) THEN RAISE(ABORT,'hold receipt is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_lifecycle BEFORE UPDATE ON user BEGIN
SELECT CASE WHEN (OLD.deactivated_at IS NOT NULL AND NEW.deactivated_at IS NOT OLD.deactivated_at) THEN RAISE(ABORT,'deactivated identity cannot reactivate') END;SELECT CASE WHEN (NEW.deactivated_at IS NOT OLD.deactivated_at AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='redact_identity')) THEN RAISE(ABORT,'deactivation needs exact assessed task') END;SELECT CASE WHEN (OLD.deactivated_at IS NOT NULL AND (NEW.name IS NOT OLD.name OR NEW.email IS NOT OLD.email OR NEW.email_verified IS NOT OLD.email_verified OR NEW.image IS NOT OLD.image OR NEW.phone_number IS NOT OLD.phone_number OR NEW.phone_number_verified IS NOT OLD.phone_number_verified OR NEW.role IS NOT OLD.role) AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='redact_identity')) THEN RAISE(ABORT,'deactivated profile is frozen') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='redact_identity') AND EXISTS(SELECT 1 FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id WHERE l.status='published' AND (l.freelancer_id=OLD.id OR cp.user_id=OLD.id) AND (NEW.name IS NOT OLD.name OR NEW.email IS NOT OLD.email))) THEN RAISE(ABORT,'withdraw retained publications before identity erasure') END;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_owner_name_frozen;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_profile_name_frozen;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_case_frozen_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_portfolio_frozen_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_portfolio_frozen_update;
--> statement-breakpoint
CREATE TRIGGER verification_owner_name_frozen BEFORE UPDATE OF name ON user BEGIN
SELECT CASE WHEN (NEW.name IS NOT OLD.name AND (EXISTS(SELECT 1 FROM verification_case WHERE freelancer_id=OLD.id AND decided_at IS NULL) OR EXISTS(SELECT 1 FROM freelancer_profile WHERE user_id=OLD.id AND status='verified')) AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='redact_identity')) THEN RAISE(ABORT,'reviewed name is fixed') END;
END;
--> statement-breakpoint
CREATE TRIGGER verification_profile_name_frozen BEFORE UPDATE OF display_name ON freelancer_profile BEGIN
SELECT CASE WHEN (NEW.display_name IS NOT OLD.display_name AND (OLD.status='verified' OR EXISTS(SELECT 1 FROM verification_case WHERE freelancer_id=OLD.user_id AND decided_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='freelancer_profile' AND m.target_id=OLD.user_id AND m.operation='redact_identity')) THEN RAISE(ABORT,'reviewed profile name is fixed') END;
END;
--> statement-breakpoint
CREATE TRIGGER verification_case_frozen_update BEFORE UPDATE ON verification_case BEGIN
SELECT CASE WHEN ((OLD.decided_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.freelancer_id IS NOT OLD.freelancer_id OR NEW.created_at IS NOT OLD.created_at OR NEW.method IS NOT OLD.method) AND NOT (NEW.id IS OLD.id AND NEW.freelancer_id IS OLD.freelancer_id AND NEW.reviewer_id IS OLD.reviewer_id AND NEW.method IS OLD.method AND NEW.id_kind IS OLD.id_kind AND NEW.result IS OLD.result AND NEW.name_match IS OLD.name_match AND NEW.inspected_at IS OLD.inspected_at AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.submitted_profile IS NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='verification_case' AND m.target_id=OLD.id AND m.operation='redact_identity'))) THEN RAISE(ABORT,'verification case is immutable') END;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_submitted_profile_frozen;
--> statement-breakpoint
CREATE TRIGGER verification_portfolio_frozen_update BEFORE UPDATE ON portfolio_link BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM verification_case WHERE freelancer_id=OLD.freelancer_id AND decided_at IS NULL) AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='redact_identity') AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'reviewed portfolio is fixed') END;
END;
--> statement-breakpoint
CREATE TRIGGER verification_portfolio_frozen_delete BEFORE DELETE ON portfolio_link BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM verification_case WHERE freelancer_id=OLD.freelancer_id AND decided_at IS NULL) AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='redact_identity') AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'reviewed portfolio is fixed') END;
END;
--> statement-breakpoint
CREATE TRIGGER export_issue BEFORE INSERT ON export_delivery BEGIN
SELECT CASE WHEN (NEW.object_key IS NULL OR NEW.token_hash IS NULL OR length(NEW.token_hash)<32 OR NEW.downloaded_at IS NOT NULL OR NEW.purged_at IS NOT NULL) THEN RAISE(ABORT,'private one-use export required') END;SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM privacy_request p JOIN pilot_live_staff a ON a.id=p.responsible_id AND a.role='admin' JOIN user u ON u.id=p.subject_user_id WHERE p.id=NEW.privacy_request_id AND p.kind IN ('export','closure') AND p.status IN ('assessing','executing') AND p.identity_verified_at IS NOT NULL AND p.assessed_at IS NOT NULL AND p.assessment IS NOT NULL AND ((NEW.auth_kind='session' AND u.deactivated_at IS NULL AND u.banned=0) OR (NEW.auth_kind='assessed_capability' AND p.identity_verified_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') AND json_extract(p.assessment,'$.export.secureHandover')=1)))) THEN RAISE(ABORT,'assessed recipient export required') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM export_delivery d WHERE d.privacy_request_id=NEW.privacy_request_id AND d.token_hash IS NOT NULL AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN RAISE(ABORT,'one live export per request') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM privacy_request p,json_each(p.scope,'$.sources') s WHERE p.id=NEW.privacy_request_id AND (julianday(json_extract(s.value,'$.deadline')) IS NULL OR NEW.expires_at>json_extract(s.value,'$.deadline')))) THEN RAISE(ABORT,'export exceeds included-source lifetime') END;
END;
--> statement-breakpoint
CREATE TRIGGER export_update BEFORE UPDATE ON export_delivery BEGIN
SELECT CASE WHEN (NEW.write_inflight IS NOT OLD.write_inflight AND NOT (OLD.write_inflight=1 AND NEW.write_inflight=0 AND NEW.object_key IS OLD.object_key AND NEW.token_hash IS OLD.token_hash AND NEW.downloaded_at IS OLD.downloaded_at AND NEW.purged_at IS OLD.purged_at))
 OR (OLD.write_inflight=1 AND (NEW.object_key IS NOT OLD.object_key OR NEW.downloaded_at IS NOT OLD.downloaded_at OR NEW.purged_at IS NOT OLD.purged_at))
 THEN RAISE(ABORT,'unsettled export writer owns artifact tracking') END;
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.privacy_request_id IS NOT OLD.privacy_request_id OR NEW.auth_kind IS NOT OLD.auth_kind OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at) THEN RAISE(ABORT,'export receipt is immutable') END;SELECT CASE WHEN (NEW.token_hash IS NOT OLD.token_hash AND NEW.token_hash IS NOT NULL) THEN RAISE(ABORT,'export token cannot rotate or replay') END;SELECT CASE WHEN (OLD.token_hash IS NULL AND NEW.downloaded_at IS NOT OLD.downloaded_at OR OLD.downloaded_at IS NOT NULL AND NEW.downloaded_at IS NOT OLD.downloaded_at OR OLD.purged_at IS NOT NULL AND NEW.purged_at IS NOT OLD.purged_at) THEN RAISE(ABORT,'export use is immutable') END;SELECT CASE WHEN (NEW.object_key IS NOT OLD.object_key AND NOT (NEW.object_key IS NULL AND NEW.purged_at IS NOT NULL AND NEW.token_hash IS NULL)) THEN RAISE(ABORT,'export artifact must be confirmed purged') END;SELECT CASE WHEN (NEW.downloaded_at IS NOT OLD.downloaded_at AND (OLD.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.token_hash IS NOT NULL OR NEW.downloaded_at IS NULL OR NOT EXISTS(SELECT 1 FROM privacy_request p JOIN user u ON u.id=p.subject_user_id WHERE p.id=NEW.privacy_request_id AND p.identity_verified_at IS NOT NULL AND (NEW.auth_kind='assessed_capability' OR u.deactivated_at IS NULL AND u.banned=0)))) THEN RAISE(ABORT,'export delivery is revoked or expired') END;
END;
--> statement-breakpoint
CREATE TRIGGER export_deactivation_revoke AFTER UPDATE OF deactivated_at ON user WHEN OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL BEGIN
UPDATE export_delivery SET token_hash=NULL WHERE auth_kind='session' AND privacy_request_id IN (SELECT id FROM privacy_request WHERE subject_user_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER backup_issue BEFORE INSERT ON backup_disposition BEGIN
SELECT CASE WHEN (NEW.status!='pending' OR NEW.verified_at IS NOT NULL OR length(trim(NEW.backup_ref))=0) THEN RAISE(ABORT,'backup must start pending') END;
END;
--> statement-breakpoint
CREATE TRIGGER backup_update BEFORE UPDATE ON backup_disposition BEGIN
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.privacy_request_id IS NOT OLD.privacy_request_id OR NEW.target_type IS NOT OLD.target_type OR NEW.target_id IS NOT OLD.target_id OR NEW.backup_ref IS NOT OLD.backup_ref OR NEW.action IS NOT OLD.action OR NEW.basis IS NOT OLD.basis OR NEW.due_at IS NOT OLD.due_at OR OLD.status!='pending' OR NEW.status!='verified' OR NEW.verified_at IS NULL) THEN RAISE(ABORT,'backup receipt is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_delete_confirmed BEFORE DELETE ON proof_file BEGIN
SELECT CASE WHEN (OLD.status!='purged' OR OLD.purge_inflight!=0) THEN RAISE(ABORT,'proof bytes must be confirmed purged') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_delete_dependencies BEFORE DELETE ON user BEGIN
SELECT CASE WHEN (EXISTS(SELECT 1 FROM session WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM account WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM policy_acceptance WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM freelancer_profile WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM client_profile WHERE user_id=OLD.id) OR OLD.deactivated_at IS NULL) THEN RAISE(ABORT,'erase dependents explicitly before user') END;
END;
--> statement-breakpoint
CREATE TRIGGER verification_submitted_profile_frozen BEFORE UPDATE OF submitted_profile ON verification_case BEGIN
SELECT CASE WHEN (NEW.submitted_profile IS NOT OLD.submitted_profile AND NOT (NEW.submitted_profile IS NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='verification_case' AND m.target_id=OLD.id AND m.operation='redact_identity'))) THEN RAISE(ABORT,'submitted verification profile is immutable') END;
END;
--> statement-breakpoint
CREATE VIEW pilot_filer_actor AS SELECT l.id AS log_id,u.id AS filer_id FROM engagement_log l JOIN user u ON u.id=l.freelancer_id JOIN freelancer_profile f ON f.user_id=u.id JOIN engagement e ON e.id=l.engagement_id WHERE u.role='freelancer' AND u.banned=0 AND u.deactivated_at IS NULL AND f.status='verified' AND e.status='accepted' AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.user_id=u.id AND p.policy='privacy' AND p.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=p.policy) AND p.retired_at IS NULL) AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.user_id=u.id AND p.policy='terms' AND p.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=p.policy) AND p.retired_at IS NULL) AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.user_id=u.id AND p.policy='freelancer_ack' AND p.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=p.policy) AND p.retired_at IS NULL);
--> statement-breakpoint
DROP TRIGGER pilot_engagement_log_delete;
--> statement-breakpoint
DROP TRIGGER pilot_log_revision_delete;
--> statement-breakpoint
DROP TRIGGER pilot_proof_file_delete;
--> statement-breakpoint
DROP TRIGGER pilot_portfolio_link_delete;
--> statement-breakpoint
CREATE TRIGGER pilot_engagement_log_delete BEFORE DELETE ON engagement_log BEGIN
SELECT CASE WHEN (NOT ((OLD.status='draft' AND EXISTS(SELECT 1 FROM pilot_unheld_target t WHERE t.target_type='engagement_log' AND t.target_id=OLD.id) AND NOT (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=OLD.id OR m.target_type='engagement_log' AND m.target_id=OLD.id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=OLD.id AND p.purge_inflight=1))) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='purge'))) THEN RAISE(ABORT,'exact purge authority or editable draft required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_log_revision_delete BEFORE DELETE ON log_revision BEGIN
SELECT CASE WHEN (NOT ((OLD.state='draft' AND OLD.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND l.status='draft') AND EXISTS(SELECT 1 FROM pilot_unheld_target t WHERE t.target_type='engagement_log' AND t.target_id=OLD.log_id) AND NOT (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=OLD.log_id OR m.target_type='engagement_log' AND m.target_id=OLD.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=OLD.log_id AND p.purge_inflight=1))) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='log_revision' AND m.target_id=OLD.id AND m.operation='purge'))) THEN RAISE(ABORT,'exact purge authority or editable draft required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_proof_file_delete BEFORE DELETE ON proof_file BEGIN
SELECT CASE WHEN OLD.write_inflight=1 THEN RAISE(ABORT,'unsettled proof writer owns tracking') END;
 SELECT CASE WHEN NOT ((OLD.status='purged' AND OLD.purge_inflight=0 AND (NOT EXISTS(SELECT 1 FROM revision_proof rp JOIN log_revision r ON r.id=rp.revision_id WHERE rp.proof_id=OLD.id AND r.state='submitted') AND NOT EXISTS(SELECT 1 FROM proof_review pr WHERE pr.proof_id=OLD.id) AND (OLD.revision_id IS NULL OR EXISTS(SELECT 1 FROM log_revision r WHERE r.id=OLD.revision_id AND r.state='draft' AND r.decision IS NULL)) AND (OLD.owner_kind='filer' AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND l.status IN ('draft','ask_changes','published','hidden')) OR OLD.owner_kind='client' AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=OLD.correction_request_id AND q.status IN ('draft','ask_changes'))) AND EXISTS(SELECT 1 FROM pilot_unheld_target x WHERE x.target_type='proof_file' AND x.target_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target x ON x.target_type=m.target_type AND x.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (x.log_id=OLD.log_id OR m.target_type='engagement_log' AND m.target_id=OLD.log_id)) AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=OLD.log_id AND p.id!=OLD.id AND p.purge_inflight=1))) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='proof_file' AND m.target_id=OLD.id AND m.operation='purge')) THEN RAISE(ABORT,'exact purge authority or isolated compensation required') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_portfolio_link_delete BEFORE DELETE ON portfolio_link BEGIN
SELECT CASE WHEN (NOT ((NOT EXISTS(SELECT 1 FROM verification_case v WHERE v.freelancer_id=OLD.freelancer_id AND v.decided_at IS NULL) AND NOT EXISTS(SELECT 1 FROM user u WHERE u.id=OLD.freelancer_id AND u.deactivated_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='portfolio_link' AND m.target_id=OLD.id AND m.operation='purge'))) THEN RAISE(ABORT,'exact purge authority or editable draft required') END;
END;
--> statement-breakpoint
DROP TRIGGER log_private_update;
--> statement-breakpoint
DROP TRIGGER log_requires_proof;
--> statement-breakpoint
DROP TRIGGER log_revision_private_insert;
--> statement-breakpoint
DROP TRIGGER log_revision_private_update;
--> statement-breakpoint
DROP TRIGGER log_tag_private_insert;
--> statement-breakpoint
DROP TRIGGER log_tag_private_update;
--> statement-breakpoint
DROP TRIGGER proof_private_insert;
--> statement-breakpoint
DROP TRIGGER proof_private_update;
--> statement-breakpoint
CREATE VIEW pilot_approved_revision AS SELECT r.id AS revision_id,rr.id AS round_id,c.id AS case_id,a.reviewer_id FROM log_revision r JOIN review_round rr ON rr.revision_id=r.id AND rr.decision=r.decision AND rr.reviewer_id=r.decided_by AND rr.decided_at=r.decided_at JOIN moderation_case c ON c.id=rr.case_id JOIN pilot_review_actor a ON a.case_id=c.id AND a.reviewer_id=rr.reviewer_id WHERE r.decision IN ('approve','correct') AND r.state='submitted' AND r.invalidated_at IS NULL AND r.reason=rr.reason AND c.log_id=r.log_id AND (SELECT count(*) FROM revision_proof rp JOIN proof_file p ON p.id=rp.proof_id WHERE rp.revision_id=r.id AND p.owner_kind='filer' AND p.status='attached' AND p.purge_inflight=0) BETWEEN 1 AND 5 AND NOT EXISTS(SELECT 1 FROM revision_proof rp JOIN proof_file p ON p.id=rp.proof_id WHERE rp.revision_id=r.id AND (p.log_id!=r.log_id OR p.status!='attached' OR p.purge_inflight!=0 OR NOT EXISTS(SELECT 1 FROM proof_review pr WHERE pr.round_id=rr.id AND pr.proof_id=p.id AND pr.proof_sha256=p.sha256 AND pr.verdict='accepted'))) AND EXISTS(SELECT 1 FROM log_tag t WHERE t.revision_id=r.id);
--> statement-breakpoint
CREATE TRIGGER round_issue BEFORE INSERT ON review_round BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE a.case_id=NEW.case_id AND a.reviewer_id=NEW.reviewer_id AND ((c.kind='verification' AND NEW.revision_id IS NULL AND NEW.decision IN ('approve','reject')) OR (c.kind IN ('log','filer_update') AND NEW.decision IN ('approve','ask_changes','reject') AND EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.revision_id AND r.log_id=c.log_id AND r.moderation_case_id=c.id AND r.state='submitted' AND r.decision IS NULL AND r.kind=CASE c.kind WHEN 'log' THEN 'initial' ELSE 'filer_update' END)) OR (c.kind='correction' AND NEW.decision IN ('uphold','ask_changes','correct','withdraw') AND (NEW.decision!='correct' OR EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.revision_id AND r.log_id=c.log_id AND r.moderation_case_id=c.id AND r.kind='correction' AND r.state='submitted' AND r.decision IS NULL)))))) THEN RAISE(ABORT,'live independent claimed reviewer and exact revision required') END;SELECT CASE WHEN (NEW.round_no!=coalesce((SELECT max(round_no)+1 FROM review_round WHERE case_id=NEW.case_id),1) OR abs((julianday(NEW.decided_at)-julianday('now'))*86400)>60) THEN RAISE(ABORT,'round allocation or time conflict') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM moderation_case c WHERE c.id=NEW.case_id AND (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=c.log_id OR m.target_type='engagement_log' AND m.target_id=c.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=c.log_id AND p.purge_inflight=1)))) THEN RAISE(ABORT,'maintenance already claimed') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_verdict_issue BEFORE INSERT ON proof_review BEGIN
SELECT CASE WHEN (NEW.proof_id IS NULL OR NOT EXISTS(SELECT 1 FROM review_round rr JOIN moderation_case c ON c.id=rr.case_id JOIN pilot_review_actor a ON a.case_id=c.id AND a.reviewer_id=rr.reviewer_id JOIN proof_file p ON p.id=NEW.proof_id WHERE rr.id=NEW.round_id AND rr.round_no=(SELECT max(round_no) FROM review_round WHERE case_id=c.id) AND p.log_id=c.log_id AND p.sha256=NEW.proof_sha256 AND p.status='attached' AND p.purge_inflight=0 AND NEW.reviewed_at<=rr.decided_at AND NEW.reviewed_at>=strftime('%Y-%m-%dT%H:%M:%fZ',c.claimed_until,'-30 minutes') AND julianday(NEW.reviewed_at) IS NOT NULL AND (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=rr.revision_id AND rp.proof_id=p.id) OR (c.kind='correction' AND EXISTS(SELECT 1 FROM engagement_log l JOIN revision_proof rp ON rp.revision_id=l.current_revision_id WHERE l.id=c.log_id AND rp.proof_id=p.id)) OR c.kind='correction' AND p.correction_request_id=c.correction_request_id AND EXISTS(SELECT 1 FROM correction_request q,json_each(q.active_proof_ids) selected WHERE q.id=c.correction_request_id AND selected.value=p.id)))) THEN RAISE(ABORT,'exact claimed human proof receipt required') END;
END;
--> statement-breakpoint
CREATE TRIGGER revision_proof_insert BEFORE INSERT ON revision_proof BEGIN
SELECT CASE WHEN (NOT EXISTS(SELECT 1 FROM log_revision r JOIN proof_file p ON p.id=NEW.proof_id JOIN engagement_log l ON l.id=r.log_id WHERE r.id=NEW.revision_id AND p.log_id=r.log_id AND p.status='attached' AND p.purge_inflight=0 AND r.decision IS NULL AND ((r.state='draft' AND r.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=r.log_id AND ((r.kind='initial' AND l.status IN ('draft','ask_changes')) OR (r.kind='filer_update' AND l.status IN ('published','hidden')) OR (r.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=r.moderation_case_id AND c.kind='correction' AND a.reviewer_id=r.submitted_by))))) OR r.state='submitted' AND NOT EXISTS(SELECT 1 FROM review_round rr WHERE rr.revision_id=r.id)) AND (p.owner_kind='filer' OR r.kind='correction' AND EXISTS(SELECT 1 FROM moderation_case c WHERE c.id=r.moderation_case_id AND c.correction_request_id=p.correction_request_id)))) THEN RAISE(ABORT,'same-log editable evidence required') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=(SELECT log_id FROM log_revision WHERE id=NEW.revision_id) OR m.target_type='engagement_log' AND m.target_id=(SELECT log_id FROM log_revision WHERE id=NEW.revision_id))) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=(SELECT log_id FROM log_revision WHERE id=NEW.revision_id) AND p.purge_inflight=1)) THEN RAISE(ABORT,'maintenance already claimed') END;
END;
--> statement-breakpoint
CREATE TRIGGER revision_proof_update BEFORE UPDATE ON revision_proof BEGIN
SELECT RAISE(ABORT,'revision evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER revision_proof_delete BEFORE DELETE ON revision_proof BEGIN
SELECT CASE WHEN (NOT (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='log_revision' AND m.target_id=OLD.revision_id AND m.operation='purge') OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='proof_file' AND m.target_id=OLD.proof_id AND m.operation='purge') OR EXISTS(SELECT 1 FROM log_revision r WHERE r.id=OLD.revision_id AND (r.state='draft' AND r.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=r.log_id AND ((r.kind='initial' AND l.status IN ('draft','ask_changes')) OR (r.kind='filer_update' AND l.status IN ('published','hidden')) OR (r.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=r.moderation_case_id AND c.kind='correction' AND a.reviewer_id=r.submitted_by))))) AND NOT EXISTS(SELECT 1 FROM review_round rr WHERE rr.revision_id=r.id)))) THEN RAISE(ABORT,'submitted evidence set is frozen') END;
END;
--> statement-breakpoint
CREATE TRIGGER revision_insert BEFORE INSERT ON log_revision BEGIN
SELECT CASE WHEN (NEW.state!='draft' OR NEW.decision IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decided_by IS NOT NULL OR NEW.invalidated_at IS NOT NULL OR NEW.reason IS NOT NULL) THEN RAISE(ABORT,'revision must start as undecided draft') END;SELECT CASE WHEN (NEW.rev_no!=coalesce((SELECT max(rev_no)+1 FROM log_revision WHERE log_id=NEW.log_id),1)) THEN RAISE(ABORT,'revision sequence conflict') END;SELECT CASE WHEN (NOT ((NEW.state='draft' AND NEW.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND ((NEW.kind='initial' AND l.status IN ('draft','ask_changes')) OR (NEW.kind='filer_update' AND l.status IN ('published','hidden')) OR (NEW.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=NEW.moderation_case_id AND c.kind='correction' AND a.reviewer_id=NEW.submitted_by)))))) OR (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=NEW.log_id OR m.target_type='engagement_log' AND m.target_id=NEW.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=NEW.log_id AND p.purge_inflight=1))) THEN RAISE(ABORT,'editable proposal required') END;SELECT CASE WHEN (NEW.kind!='correction' AND NOT EXISTS(SELECT 1 FROM pilot_filer_actor a WHERE a.log_id=NEW.log_id AND a.filer_id=NEW.submitted_by)) THEN RAISE(ABORT,'verified acknowledged filer required') END;SELECT CASE WHEN (NEW.kind='filer_update' AND (NEW.effective_on IS NULL OR NEW.effective_on>date('now','+8 hours') OR NEW.effective_on<=coalesce((SELECT max(effective_on) FROM log_revision r WHERE r.log_id=NEW.log_id AND r.kind='filer_update' AND r.decision='approve'),(SELECT date(published_at,'+8 hours') FROM engagement_log WHERE id=NEW.log_id)))) THEN RAISE(ABORT,'later approved effective date required') END;
END;
--> statement-breakpoint
CREATE TRIGGER revision_update BEFORE UPDATE ON log_revision BEGIN
SELECT CASE WHEN (NEW.id IS NOT OLD.id OR NEW.log_id IS NOT OLD.log_id OR NEW.rev_no IS NOT OLD.rev_no OR NEW.kind IS NOT OLD.kind OR NEW.submitted_by IS NOT OLD.submitted_by OR (NEW.submitted_at IS NOT OLD.submitted_at AND NOT (OLD.state='draft' AND NEW.state='submitted' AND abs((julianday(NEW.submitted_at)-julianday('now'))*86400)<=60)) OR OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS NOT OLD.invalidated_at) THEN RAISE(ABORT,'revision identity is immutable') END;SELECT CASE WHEN ((NEW.rating IS NOT OLD.rating OR NEW.outcome IS NOT OLD.outcome OR NEW.facts IS NOT OLD.facts OR NEW.period_start IS NOT OLD.period_start OR NEW.period_end IS NOT OLD.period_end OR NEW.amount_centavos IS NOT OLD.amount_centavos OR NEW.effective_on IS NOT OLD.effective_on OR NEW.draft_updated_at IS NOT OLD.draft_updated_at) AND NOT ((OLD.state='draft' AND OLD.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND ((OLD.kind='initial' AND l.status IN ('draft','ask_changes')) OR (OLD.kind='filer_update' AND l.status IN ('published','hidden')) OR (OLD.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=OLD.moderation_case_id AND c.kind='correction' AND a.reviewer_id=OLD.submitted_by))))))) THEN RAISE(ABORT,'submitted revision content is frozen') END;SELECT CASE WHEN (OLD.state='submitted' AND NEW.state!='submitted') THEN RAISE(ABORT,'submitted revision cannot reopen') END;SELECT CASE WHEN (NEW.moderation_case_id IS NOT OLD.moderation_case_id AND NOT (OLD.moderation_case_id IS NULL AND EXISTS(SELECT 1 FROM moderation_case c WHERE c.id=NEW.moderation_case_id AND (c.log_id=NEW.log_id OR c.kind='log' AND c.subject_id=NEW.log_id) AND c.status='open'))) THEN RAISE(ABORT,'revision case binding is immutable') END;SELECT CASE WHEN (NEW.state='submitted' AND OLD.state='draft' AND (length(trim(NEW.facts)) NOT BETWEEN 40 AND 2000 OR NOT EXISTS(SELECT 1 FROM log_tag t WHERE t.revision_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=NEW.id) OR NEW.kind!='correction' AND NOT EXISTS(SELECT 1 FROM pilot_filer_actor a WHERE a.log_id=NEW.log_id AND a.filer_id=NEW.submitted_by))) THEN RAISE(ABORT,'complete acknowledged proposal required') END;SELECT CASE WHEN ((NEW.decision IS NOT OLD.decision OR NEW.reason IS NOT OLD.reason OR NEW.decided_by IS NOT OLD.decided_by OR NEW.decided_at IS NOT OLD.decided_at) AND (OLD.decision IS NOT NULL OR NOT EXISTS(SELECT 1 FROM review_round rr JOIN pilot_review_actor a ON a.case_id=rr.case_id AND a.reviewer_id=rr.reviewer_id WHERE rr.revision_id=NEW.id AND rr.reviewer_id=NEW.decided_by AND rr.decision=NEW.decision AND rr.reason=NEW.reason AND rr.decided_at=NEW.decided_at AND rr.case_id=NEW.moderation_case_id))) THEN RAISE(ABORT,'revision decision needs current human round') END;SELECT CASE WHEN (NEW.invalidated_at IS NOT OLD.invalidated_at AND NOT EXISTS(SELECT 1 FROM moderation_case c JOIN pilot_review_actor a ON a.case_id=c.id JOIN review_round rr ON rr.case_id=c.id WHERE c.kind='correction' AND c.log_id=OLD.log_id AND rr.decision='correct' AND rr.decided_at=NEW.invalidated_at)) THEN RAISE(ABORT,'invalidation needs independent correction') END;SELECT CASE WHEN ((EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=NEW.log_id OR m.target_type='engagement_log' AND m.target_id=NEW.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=NEW.log_id AND p.purge_inflight=1))) THEN RAISE(ABORT,'maintenance already claimed') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_tag_insert BEFORE INSERT ON log_tag BEGIN
SELECT CASE WHEN (NOT (EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.revision_id AND (r.state='draft' AND r.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=r.log_id AND ((r.kind='initial' AND l.status IN ('draft','ask_changes')) OR (r.kind='filer_update' AND l.status IN ('published','hidden')) OR (r.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=r.moderation_case_id AND c.kind='correction' AND a.reviewer_id=r.submitted_by))))) AND NOT (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=r.log_id OR m.target_type='engagement_log' AND m.target_id=r.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=r.log_id AND p.purge_inflight=1))))) THEN RAISE(ABORT,'submitted tags are frozen') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_tag_update BEFORE UPDATE ON log_tag BEGIN
SELECT CASE WHEN (NOT (EXISTS(SELECT 1 FROM log_revision r WHERE r.id=OLD.revision_id AND (r.state='draft' AND r.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=r.log_id AND ((r.kind='initial' AND l.status IN ('draft','ask_changes')) OR (r.kind='filer_update' AND l.status IN ('published','hidden')) OR (r.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=r.moderation_case_id AND c.kind='correction' AND a.reviewer_id=r.submitted_by))))) AND NOT (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=r.log_id OR m.target_type='engagement_log' AND m.target_id=r.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=r.log_id AND p.purge_inflight=1))))) THEN RAISE(ABORT,'submitted tags are frozen') END;SELECT CASE WHEN (NEW.revision_id IS NOT OLD.revision_id) THEN RAISE(ABORT,'tag owner is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER pilot_tag_delete BEFORE DELETE ON log_tag BEGIN
SELECT CASE WHEN (NOT (EXISTS(SELECT 1 FROM log_revision r WHERE r.id=OLD.revision_id AND (r.state='draft' AND r.decision IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=r.log_id AND ((r.kind='initial' AND l.status IN ('draft','ask_changes')) OR (r.kind='filer_update' AND l.status IN ('published','hidden')) OR (r.kind='correction' AND l.status IN ('published','hidden') AND EXISTS(SELECT 1 FROM pilot_review_actor a JOIN moderation_case c ON c.id=a.case_id WHERE c.id=r.moderation_case_id AND c.kind='correction' AND a.reviewer_id=r.submitted_by))))) AND NOT (EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=r.log_id OR m.target_type='engagement_log' AND m.target_id=r.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=r.log_id AND p.purge_inflight=1))) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='log_revision' AND m.target_id=OLD.revision_id AND m.operation='purge'))) THEN RAISE(ABORT,'submitted tags are frozen') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_insert BEFORE INSERT ON proof_file BEGIN
SELECT CASE WHEN (NEW.purge_attempts!=0 OR NEW.purge_inflight!=0 OR (NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.revision_id AND r.log_id=NEW.log_id AND r.submitted_by=NEW.uploaded_by AND r.state='draft' AND r.decision IS NULL AND NEW.owner_kind='filer')) OR NEW.status NOT IN ('uploading','pending_purge')) THEN RAISE(ABORT,'proof must start unbound uploading') END;SELECT CASE WHEN ((EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target t ON t.target_type=m.target_type AND t.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (t.log_id=NEW.log_id OR m.target_type='engagement_log' AND m.target_id=NEW.log_id)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=NEW.log_id AND p.purge_inflight=1)) OR NOT EXISTS(SELECT 1 FROM pilot_unheld_target t WHERE t.target_type='engagement_log' AND t.target_id=NEW.log_id)) THEN RAISE(ABORT,'proof target held or cleanup in progress') END;SELECT CASE WHEN (NOT ((NEW.owner_kind='client' AND EXISTS(SELECT 1 FROM correction_request q JOIN engagement_log l ON l.id=q.log_id JOIN client_profile cp ON cp.id=l.client_id JOIN user u ON u.id=cp.user_id WHERE q.id=NEW.correction_request_id AND q.log_id=NEW.log_id AND q.requested_by=NEW.uploaded_by AND u.id=NEW.uploaded_by AND u.role='client' AND u.banned=0 AND u.deactivated_at IS NULL AND q.status IN ('draft','ask_changes') AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='privacy' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL) AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='terms' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL))) OR (NEW.owner_kind='filer' AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM pilot_filer_actor a JOIN engagement_log l ON l.id=a.log_id WHERE a.log_id=NEW.log_id AND a.filer_id=NEW.uploaded_by AND l.status IN ('draft','ask_changes','published','hidden'))))) THEN RAISE(ABORT,'proof requires editable relationship') END;SELECT CASE WHEN ((NEW.owner_kind='client' AND (SELECT json_array_length(active_proof_ids) FROM correction_request WHERE id=NEW.correction_request_id)>=5) OR (NEW.owner_kind='filer' AND (SELECT count(*) FROM proof_file p WHERE p.log_id=NEW.log_id AND p.owner_kind='filer' AND p.revision_id IS NEW.revision_id AND p.status IN ('uploading','attached'))>=5)) THEN RAISE(ABORT,'five proof limit reached') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_update BEFORE UPDATE ON proof_file BEGIN
 SELECT CASE WHEN NEW.write_inflight IS NOT OLD.write_inflight AND NOT (OLD.write_inflight=1 AND NEW.write_inflight=0
 AND NEW.revision_id IS OLD.revision_id AND NEW.correction_request_id IS OLD.correction_request_id AND NEW.status IS OLD.status
 AND NEW.purge_attempts IS OLD.purge_attempts AND NEW.purge_inflight IS OLD.purge_inflight)
 THEN RAISE(ABORT,'proof writer can only settle its original reservation') END;
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.log_id IS NOT OLD.log_id OR NEW.owner_kind IS NOT OLD.owner_kind OR NEW.uploaded_by IS NOT OLD.uploaded_by OR NEW.object_key IS NOT OLD.object_key OR NEW.kind IS NOT OLD.kind OR NEW.mime IS NOT OLD.mime OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.sha256 IS NOT OLD.sha256 OR NEW.uploaded_at IS NOT OLD.uploaded_at OR NEW.correction_request_id IS NOT OLD.correction_request_id THEN RAISE(ABORT,'proof byte metadata is immutable') END;
 SELECT CASE WHEN NEW.revision_id IS NOT OLD.revision_id AND NOT ((OLD.revision_id IS NULL AND OLD.status='uploading' AND NEW.status='attached' AND NEW.owner_kind='filer' AND EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.revision_id AND r.log_id=NEW.log_id AND r.submitted_by=NEW.uploaded_by AND r.state='draft' AND r.decision IS NULL)) OR (NEW.revision_id IS NULL AND OLD.revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='log_revision' AND m.target_id=OLD.revision_id AND m.operation='purge') AND NEW.status IS OLD.status AND NEW.purge_attempts IS OLD.purge_attempts AND NEW.purge_inflight IS OLD.purge_inflight)) THEN RAISE(ABORT,'proof origin is immutable') END;
 SELECT CASE WHEN NEW.status='attached' AND NOT ((NEW.owner_kind='filer' AND (NEW.revision_id IS NOT NULL OR EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=OLD.id))) OR (NEW.owner_kind='client' AND NEW.revision_id IS NULL AND NEW.correction_request_id IS NOT NULL)) THEN RAISE(ABORT,'attached proof ownership invalid') END;
 SELECT CASE WHEN NOT (NEW.status=OLD.status OR OLD.status='uploading' AND NEW.status IN ('attached','abandoned','pending_purge') OR OLD.status IN ('attached','abandoned','purged') AND NEW.status='pending_purge' OR OLD.status='pending_purge' AND NEW.status='purged') THEN RAISE(ABORT,'invalid proof transition') END;
 SELECT CASE WHEN (NEW.status IN ('pending_purge','purged') OR NEW.purge_attempts IS NOT OLD.purge_attempts OR NEW.purge_inflight IS NOT OLD.purge_inflight) AND NOT ((NOT EXISTS(SELECT 1 FROM revision_proof rp JOIN log_revision r ON r.id=rp.revision_id WHERE rp.proof_id=OLD.id AND r.state='submitted') AND NOT EXISTS(SELECT 1 FROM proof_review pr WHERE pr.proof_id=OLD.id) AND (OLD.revision_id IS NULL OR EXISTS(SELECT 1 FROM log_revision r WHERE r.id=OLD.revision_id AND r.state='draft' AND r.decision IS NULL)) AND (OLD.owner_kind='filer' AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND l.status IN ('draft','ask_changes','published','hidden')) OR OLD.owner_kind='client' AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=OLD.correction_request_id AND q.status IN ('draft','ask_changes'))) AND EXISTS(SELECT 1 FROM pilot_unheld_target x WHERE x.target_type='proof_file' AND x.target_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM maintenance_task m JOIN pilot_maintenance_target x ON x.target_type=m.target_type AND x.target_id=m.target_id WHERE m.status IN ('claimed','blocked') AND (x.log_id=OLD.log_id OR m.target_type='engagement_log' AND m.target_id=OLD.log_id)) AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=OLD.log_id AND p.id!=OLD.id AND p.purge_inflight=1)) OR EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='proof_file' AND m.target_id=OLD.id AND m.operation='purge') OR (OLD.status='pending_purge' AND NEW.status=OLD.status AND OLD.purge_inflight=1 AND NEW.purge_inflight=0 AND NEW.purge_attempts=OLD.purge_attempts AND NEW.revision_id IS OLD.revision_id AND EXISTS(SELECT 1 FROM maintenance_task m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='proof_file' AND m.target_id=OLD.id AND m.operation='purge'))) THEN RAISE(ABORT,'submitted proof needs exact purge task') END;
 SELECT CASE WHEN NEW.purge_attempts IS NOT OLD.purge_attempts AND NOT (OLD.status='pending_purge' AND NEW.status='pending_purge' AND OLD.purge_inflight=0 AND NEW.purge_inflight=1 AND NEW.purge_attempts=OLD.purge_attempts+1) THEN RAISE(ABORT,'purge attempt must acquire exclusive claim') END;
 SELECT CASE WHEN NEW.purge_inflight IS NOT OLD.purge_inflight AND NOT ((OLD.status='pending_purge' AND NEW.status='pending_purge' AND OLD.purge_inflight=0 AND NEW.purge_inflight=1 AND NEW.purge_attempts=OLD.purge_attempts+1) OR (OLD.status='pending_purge' AND NEW.status IN ('pending_purge','purged') AND OLD.purge_inflight=1 AND NEW.purge_inflight=0 AND NEW.purge_attempts=OLD.purge_attempts)) THEN RAISE(ABORT,'invalid purge fencing') END;
 SELECT CASE WHEN NEW.purge_inflight=1 AND NEW.status!='pending_purge' THEN RAISE(ABORT,'active purge retains ownership') END;
END;

--> statement-breakpoint
CREATE VIEW pilot_case_reviewer AS SELECT c.id AS case_id,s.id AS reviewer_id FROM moderation_case c JOIN pilot_live_staff s ON s.role='moderator' WHERE
 (c.kind='verification' AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=c.subject_id AND v.freelancer_id!=s.id AND v.decided_at IS NULL)) OR
 (c.kind!='verification' AND EXISTS(SELECT 1 FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id WHERE l.id=c.log_id AND s.id!=l.freelancer_id AND s.id!=cp.user_id
 AND NOT EXISTS(SELECT 1 FROM engagement e WHERE e.freelancer_id=s.id AND e.client_id=l.client_id AND (e.status='accepted' OR e.accepted_at IS NOT NULL))
 AND (c.kind!='correction' OR (NOT EXISTS(SELECT 1 FROM moderation_case publication WHERE publication.kind='log' AND publication.log_id=l.id AND publication.decision='approve' AND publication.decided_by=s.id) AND NOT EXISTS(SELECT 1 FROM review_round rr JOIN moderation_case original ON original.id=rr.case_id WHERE original.kind='log' AND original.log_id=l.id AND rr.decision='approve' AND rr.reviewer_id=s.id)))));
--> statement-breakpoint
CREATE VIEW pilot_complete_round AS SELECT rr.* FROM review_round rr JOIN moderation_case c ON c.id=rr.case_id JOIN pilot_review_actor a ON a.case_id=c.id AND a.reviewer_id=rr.reviewer_id
 WHERE rr.round_no=(SELECT max(round_no) FROM review_round WHERE case_id=c.id) AND (c.kind!='correction' OR EXISTS(SELECT 1 FROM correction_request q WHERE q.id=c.correction_request_id AND (q.status!='submitted' OR rr.decided_at>=q.updated_at)))
 AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.status='attached' AND
 (EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=rr.revision_id AND rp.proof_id=p.id) OR (c.kind='correction' AND EXISTS(SELECT 1 FROM engagement_log l JOIN revision_proof rp ON rp.revision_id=l.current_revision_id WHERE l.id=c.log_id AND rp.proof_id=p.id)) OR c.kind='correction' AND p.correction_request_id=c.correction_request_id AND EXISTS(SELECT 1 FROM correction_request q,json_each(q.active_proof_ids) selected WHERE q.id=c.correction_request_id AND selected.value=p.id))
 AND (p.purge_inflight!=0 OR NOT EXISTS(SELECT 1 FROM proof_review pr WHERE pr.round_id=rr.id AND pr.proof_id=p.id AND pr.proof_sha256=p.sha256)));

--> statement-breakpoint
CREATE TRIGGER pilot_case_insert BEFORE INSERT ON moderation_case BEGIN
 SELECT CASE WHEN NEW.status!='open' OR NEW.claimed_by IS NOT NULL OR NEW.claimed_until IS NOT NULL OR NEW.decision IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.closure_kind IS NOT NULL THEN RAISE(ABORT,'case must start open') END;
 SELECT CASE WHEN NOT ((NEW.kind='verification' AND NEW.log_id IS NULL AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=NEW.subject_id AND v.decided_at IS NULL)) OR (NEW.kind='log' AND NEW.subject_id=NEW.log_id AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND l.status IN ('draft','ask_changes'))) OR (NEW.kind='filer_update' AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=NEW.subject_id AND r.log_id=NEW.log_id AND r.kind='filer_update' AND r.state='draft' AND r.decision IS NULL AND l.status IN ('published','hidden') AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) OR (NEW.kind='correction' AND NEW.subject_id=NEW.correction_request_id AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=NEW.subject_id AND q.log_id=NEW.log_id AND q.status IN ('draft','ask_changes')))) THEN RAISE(ABORT,'typed case subject mismatch') END;
END;

--> statement-breakpoint
DROP TRIGGER moderation_case_frozen_update;

--> statement-breakpoint
CREATE TRIGGER pilot_case_update BEFORE UPDATE ON moderation_case BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.subject_id IS NOT OLD.subject_id OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'case identity is immutable') END;
 SELECT CASE WHEN (OLD.status IN ('decided','closed') OR NEW.log_id IS NOT OLD.log_id OR NEW.correction_request_id IS NOT OLD.correction_request_id) AND NOT ((NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.subject_id IS OLD.subject_id AND NEW.status IS OLD.status AND NEW.claimed_by IS OLD.claimed_by AND NEW.claimed_until IS OLD.claimed_until AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_by IS OLD.decided_by AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.closed_at IS OLD.closed_at AND NEW.closure_kind IS OLD.closure_kind AND OLD.status IN ('decided','closed') AND ((NEW.log_id IS NULL AND OLD.log_id IS NOT NULL AND NEW.correction_request_id IS OLD.correction_request_id AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge')) OR (NEW.log_id IS OLD.log_id AND NEW.correction_request_id IS NULL AND OLD.correction_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='correction_request' AND m.target_id=OLD.correction_request_id AND m.operation='purge')))) OR (OLD.kind='verification' AND OLD.status='decided' AND OLD.closed_at IS NULL AND NEW.closed_at IS OLD.decided_at AND NEW.closure_kind='decision' AND NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.subject_id IS OLD.subject_id AND NEW.status IS OLD.status AND NEW.claimed_by IS OLD.claimed_by AND NEW.claimed_until IS OLD.claimed_until AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_by IS OLD.decided_by AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.log_id IS OLD.log_id AND NEW.correction_request_id IS OLD.correction_request_id)) THEN RAISE(ABORT,'terminal case is immutable') END;
 SELECT CASE WHEN OLD.status NOT IN ('decided','closed') AND NOT ((NEW.status='closed' AND NEW.closure_kind='erased' AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge') AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60) OR (NEW.status='claimed' AND OLD.status IN ('open','claimed') AND EXISTS(SELECT 1 FROM pilot_case_reviewer a WHERE a.case_id=OLD.id AND a.reviewer_id=NEW.claimed_by) AND NEW.claimed_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND julianday(NEW.claimed_until)<=julianday('now')+30.0/1440+1.0/86400 AND (OLD.status!='claimed' OR OLD.claimed_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.claimed_by=OLD.claimed_by)) OR (OLD.status='claimed' AND NEW.status='open' AND EXISTS(SELECT 1 FROM pilot_case_reviewer a WHERE a.case_id=OLD.id AND a.reviewer_id=OLD.claimed_by)) OR (OLD.status='awaiting_changes' AND NEW.status='open' AND ((OLD.kind IN ('log','filer_update') AND EXISTS(SELECT 1 FROM log_revision r JOIN pilot_filer_actor f ON f.log_id=r.log_id AND f.filer_id=r.submitted_by WHERE r.moderation_case_id=OLD.id AND r.state='draft' AND r.decision IS NULL)) OR (OLD.kind='correction' AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=OLD.correction_request_id AND q.status='ask_changes')))) OR (OLD.status='claimed' AND NEW.status IN ('decided','awaiting_changes') AND ((OLD.kind='verification' AND NEW.status='decided' AND NEW.decided_by=OLD.claimed_by AND EXISTS(SELECT 1 FROM pilot_live_staff a WHERE a.id=OLD.claimed_by AND a.role='moderator')) OR EXISTS(SELECT 1 FROM pilot_complete_round rr WHERE rr.case_id=OLD.id AND rr.reviewer_id=OLD.claimed_by AND ((NEW.status='awaiting_changes' AND rr.decision='ask_changes') OR (NEW.status='decided' AND rr.decision=NEW.decision AND rr.reason=NEW.reason AND rr.decided_at=NEW.decided_at AND rr.reviewer_id=NEW.decided_by))))) OR (NEW.status='closed' AND NEW.closure_kind='abandoned' AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60 AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='moderation_case' AND m.target_id=OLD.id AND m.operation='close_abandoned'))) THEN RAISE(ABORT,'case transition requires current exact authority') END;
END;

--> statement-breakpoint
CREATE TRIGGER pilot_log_update BEFORE UPDATE ON engagement_log BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.ref IS NOT OLD.ref OR NEW.engagement_id IS NOT OLD.engagement_id OR NEW.freelancer_id IS NOT OLD.freelancer_id OR NEW.client_id IS NOT OLD.client_id OR NEW.anchor_kind IS NOT OLD.anchor_kind OR NEW.anchor_date IS NOT OLD.anchor_date OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'log identity and original anchor are immutable') END;
 SELECT CASE WHEN OLD.first_submitted_at IS NOT NULL AND NEW.first_submitted_at IS NOT OLD.first_submitted_at THEN RAISE(ABORT,'first submission is immutable') END;
 SELECT CASE WHEN OLD.published_at IS NOT NULL AND (NEW.published_at IS NOT OLD.published_at OR NEW.expires_at IS NOT OLD.expires_at) THEN RAISE(ABORT,'original publication and expiry are immutable') END;
 SELECT CASE WHEN NEW.hold_kind IS NOT OLD.hold_kind OR NEW.hold_placed_at IS NOT OLD.hold_placed_at OR NEW.hold_released_at IS NOT OLD.hold_released_at THEN RAISE(ABORT,'new holds require exact bounded hold rows') END;
 SELECT CASE WHEN NEW.name_retention_until IS NOT OLD.name_retention_until AND NOT (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='redact_identity') AND julianday(NEW.name_retention_until) IS NOT NULL AND NEW.name_retention_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN RAISE(ABORT,'assessed name deadline required') END;
 SELECT CASE WHEN NEW.current_revision_id IS NOT OLD.current_revision_id AND NOT ((NEW.current_revision_id IS NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='purge')) OR EXISTS(SELECT 1 FROM pilot_approved_revision a JOIN log_revision r ON r.id=a.revision_id WHERE a.revision_id=NEW.current_revision_id AND r.log_id=OLD.id AND EXISTS(SELECT 1 FROM pilot_complete_round complete WHERE complete.id=a.round_id) AND (OLD.current_revision_id IS NULL AND r.kind='initial' OR OLD.current_revision_id IS NOT NULL AND r.kind IN ('filer_update','correction')))) THEN RAISE(ABORT,'publication pointer needs human proof approval') END;
 SELECT CASE WHEN OLD.published_at IS NULL AND NEW.published_at IS NOT NULL AND (NEW.status!='published' OR NEW.current_revision_id IS NULL OR abs((julianday(NEW.published_at)-julianday('now'))*86400)>60 OR NEW.expires_at IS NOT (strftime('%Y-%m-',NEW.published_at,'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',NEW.published_at) AS INTEGER),CAST(strftime('%d',NEW.published_at,'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(NEW.published_at,11))) THEN RAISE(ABORT,'original publication needs clamped UTC deadline') END;
 SELECT CASE WHEN NEW.status IS NOT OLD.status AND NOT ((NEW.status='expired' AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='purge')) OR (OLD.status IN ('draft','ask_changes') AND NEW.status='pending') OR (OLD.status='pending' AND NEW.status='published' AND NEW.current_revision_id IS NOT NULL) OR (OLD.status='pending' AND NEW.status IN ('ask_changes','rejected') AND EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.log_id=OLD.id AND c.kind='log' AND rr.decision=CASE NEW.status WHEN 'ask_changes' THEN 'ask_changes' ELSE 'reject' END)) OR (OLD.status IN ('published','hidden') AND NEW.status='withdrawn' AND (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='redact_identity') OR EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.log_id=OLD.id AND c.kind='correction' AND rr.decision='withdraw'))) OR (OLD.status='published' AND NEW.status='hidden' AND (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.target_type='engagement_log' AND m.target_id=OLD.id AND m.operation='redact_identity') OR EXISTS(SELECT 1 FROM correction_request q JOIN moderation_case c ON c.correction_request_id=q.id JOIN pilot_review_actor a ON a.case_id=c.id AND a.reviewer_id=q.hidden_by WHERE q.log_id=OLD.id AND q.hidden_at IS NOT NULL AND q.restored_at IS NULL))) OR (OLD.status='hidden' AND NEW.status='published' AND NEW.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.log_id=OLD.id AND c.kind='correction' AND rr.decision IN ('uphold','correct') AND NOT EXISTS(SELECT 1 FROM correction_request q WHERE q.log_id=OLD.id AND q.hidden_at IS NOT NULL AND q.restored_at IS NULL AND q.id!=c.correction_request_id)))) THEN RAISE(ABORT,'log transition requires exact review or assessed maintenance') END;
 SELECT CASE WHEN NEW.status='published' AND (NEW.published_at IS NULL OR NEW.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.current_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.id=NEW.current_revision_id AND r.log_id=NEW.id AND r.decision IN ('approve','correct') AND r.invalidated_at IS NULL) OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.freelancer_id AND (u.deactivated_at IS NULL OR NEW.name_retention_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')))) THEN RAISE(ABORT,'published record must remain eligible') END;
 SELECT CASE WHEN NEW.submitted_at IS NOT OLD.submitted_at AND NOT (NEW.status='pending' AND OLD.status IN ('draft','ask_changes') AND abs((julianday(NEW.submitted_at)-julianday('now'))*86400)<=60) THEN RAISE(ABORT,'submission clock is server owned') END;
 SELECT CASE WHEN NEW.draft_updated_at IS NOT OLD.draft_updated_at AND NOT (OLD.status IN ('draft','ask_changes','published','hidden') AND EXISTS(SELECT 1 FROM pilot_filer_actor a WHERE a.log_id=OLD.id) AND EXISTS(SELECT 1 FROM pilot_unheld_target x WHERE x.target_type='engagement_log' AND x.target_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM maintenance_task m WHERE m.target_type='engagement_log' AND m.target_id=OLD.id AND m.status IN ('claimed','blocked')) AND abs((julianday(NEW.draft_updated_at)-julianday('now'))*86400)<=60) THEN RAISE(ABORT,'draft activity requires live filer and no maintenance') END;
END;

--> statement-breakpoint
CREATE TRIGGER pilot_initial_submit BEFORE UPDATE OF status ON engagement_log
WHEN OLD.status='draft' AND NEW.status='pending'
BEGIN
  SELECT CASE WHEN NEW.first_submitted_at IS NULL OR NEW.submitted_at IS NOT NEW.first_submitted_at OR julianday(NEW.first_submitted_at) IS NULL OR abs((julianday(NEW.first_submitted_at)-julianday('now'))*86400)>60 THEN RAISE(ABORT,'initial submission needs current server time') END;
  SELECT CASE WHEN date(NEW.first_submitted_at,'+8 hours') < NEW.anchor_date OR date(NEW.first_submitted_at,'+8 hours') > date(NEW.anchor_date,'+15 days') THEN RAISE(ABORT,'outside filing window') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pilot_filer_actor a WHERE a.log_id=NEW.id AND a.filer_id=NEW.freelancer_id) THEN RAISE(ABORT,'current verified filer policies required') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM engagement e JOIN user u ON u.id=NEW.freelancer_id JOIN freelancer_profile f ON f.user_id=u.id WHERE e.id=NEW.engagement_id AND e.status='accepted' AND e.client_id=NEW.client_id AND e.freelancer_id=NEW.freelancer_id AND u.role='freelancer' AND u.banned=0 AND f.status='verified') THEN RAISE(ABORT,'accepted engagement and verified freelancer required') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.log_id=NEW.id AND r.kind='initial' AND r.state='submitted' AND r.submitted_by=NEW.freelancer_id AND r.decision IS NULL AND r.decided_at IS NULL AND r.decided_by IS NULL AND length(trim(r.facts)) BETWEEN 40 AND 2000 AND EXISTS(SELECT 1 FROM log_tag t WHERE t.revision_id=r.id)) THEN RAISE(ABORT,'complete initial revision required') END;
  SELECT CASE WHEN (SELECT count(*) FROM proof_file p JOIN log_revision r ON r.id=p.revision_id AND r.log_id=p.log_id WHERE p.log_id=NEW.id AND p.status='attached' AND p.owner_kind='filer' AND p.uploaded_by=NEW.freelancer_id AND r.kind='initial' AND r.state='submitted') NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM proof_file WHERE log_id=NEW.id AND status IN ('uploading','pending_purge')) THEN RAISE(ABORT,'attached proof required and uploads must be complete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM moderation_case WHERE kind='log' AND subject_id=NEW.id AND status='open') THEN RAISE(ABORT,'open log moderation case required') END;
  SELECT CASE WHEN (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'))>=10 OR (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND client_id=NEW.client_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 months'))>=3 THEN RAISE(ABORT,'log submission quota reached') END;
  SELECT CASE WHEN NEW.hold_kind IS NOT NULL AND (NEW.hold_released_at IS NULL OR NEW.hold_released_at < NEW.hold_placed_at) THEN RAISE(ABORT,'held draft cannot submit') END;
END;

--> statement-breakpoint
CREATE TRIGGER pilot_resubmit BEFORE UPDATE OF status ON engagement_log WHEN OLD.status='ask_changes' AND NEW.status='pending' BEGIN
 SELECT CASE WHEN NEW.first_submitted_at IS NOT OLD.first_submitted_at OR NOT EXISTS(SELECT 1 FROM log_revision r JOIN moderation_case c ON c.id=r.moderation_case_id JOIN pilot_filer_actor a ON a.log_id=r.log_id WHERE r.log_id=NEW.id AND r.kind='initial' AND r.state='submitted' AND r.decision IS NULL AND c.status='open' AND EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.revision_id=r.id)) THEN RAISE(ABORT,'complete resubmitted round required') END;
END;

--> statement-breakpoint
CREATE VIEW pilot_correction_actor AS SELECT q.id AS request_id,u.id AS client_id FROM correction_request q JOIN engagement_log l ON l.id=q.log_id JOIN client_profile cp ON cp.id=l.client_id JOIN user u ON u.id=cp.user_id
WHERE q.subject_ref=q.log_id AND q.requested_by=u.id AND u.role='client' AND u.banned=0 AND u.deactivated_at IS NULL AND l.current_revision_id IS NOT NULL AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND l.status IN ('published','hidden','withdrawn')
AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='privacy' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL)
AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='terms' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL);

--> statement-breakpoint
CREATE TRIGGER correction_insert BEFORE INSERT ON correction_request BEGIN
 SELECT CASE WHEN NEW.status!='draft' OR NEW.active_proof_ids!='[]' OR NEW.subject_ref IS NOT NEW.log_id OR NEW.submitted_at IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.hidden_at IS NOT NULL OR NEW.hidden_by IS NOT NULL OR NEW.hide_reason IS NOT NULL OR NEW.restored_at IS NOT NULL OR length(trim(NEW.new_evidence_note))=0 THEN RAISE(ABORT,'private request must start with live stable subject') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id JOIN user u ON u.id=cp.user_id WHERE l.id=NEW.log_id AND l.current_revision_id=NEW.base_revision_id AND u.id=NEW.requested_by AND u.role='client' AND u.banned=0 AND u.deactivated_at IS NULL AND l.status IN ('published','hidden','withdrawn') AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='privacy' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL) AND EXISTS(SELECT 1 FROM policy_acceptance a WHERE a.user_id=u.id AND a.policy='terms' AND a.version=(SELECT current.version FROM current_policy_version current WHERE current.policy=a.policy) AND a.retired_at IS NULL)) THEN RAISE(ABORT,'named current client required') END;
END;

--> statement-breakpoint
CREATE TRIGGER correction_update BEFORE UPDATE ON correction_request BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.subject_ref IS NOT OLD.subject_ref OR NEW.requested_by IS NOT OLD.requested_by OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'correction identity and stable reference are immutable') END;
 SELECT CASE WHEN (NEW.log_id IS NOT OLD.log_id OR NEW.base_revision_id IS NOT OLD.base_revision_id OR OLD.status IN ('closed','abandoned')) AND NOT (NEW.id IS OLD.id AND NEW.subject_ref IS OLD.subject_ref AND NEW.requested_by IS OLD.requested_by AND NEW.status IS OLD.status AND NEW.new_evidence_note IS OLD.new_evidence_note AND NEW.active_proof_ids IS OLD.active_proof_ids AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND NEW.submitted_at IS OLD.submitted_at AND NEW.closed_at IS OLD.closed_at AND NEW.hidden_at IS OLD.hidden_at AND NEW.hidden_by IS OLD.hidden_by AND NEW.hide_reason IS OLD.hide_reason AND NEW.restored_at IS OLD.restored_at AND OLD.status IN ('closed','abandoned') AND ((NEW.log_id IS NULL AND OLD.log_id IS NOT NULL AND NEW.base_revision_id IS OLD.base_revision_id AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge')) OR (NEW.log_id IS OLD.log_id AND NEW.base_revision_id IS NULL AND OLD.base_revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='log_revision' AND m.target_id=OLD.base_revision_id AND m.operation='purge')))) THEN RAISE(ABORT,'retained correction pointers need terminal exact purge') END;
 SELECT CASE WHEN NEW.new_evidence_note IS NOT OLD.new_evidence_note AND NOT (OLD.status='draft' AND OLD.submitted_at IS NULL AND NEW.status=OLD.status AND EXISTS(SELECT 1 FROM pilot_correction_actor a WHERE a.request_id=OLD.id) AND length(trim(NEW.new_evidence_note))>0) THEN RAISE(ABORT,'submitted correction content is frozen') END;
 SELECT CASE WHEN NEW.submitted_at IS NOT OLD.submitted_at AND NOT (OLD.submitted_at IS NULL AND NEW.status='submitted' AND abs((julianday(NEW.submitted_at)-julianday('now'))*86400)<=60) THEN RAISE(ABORT,'first correction submission is immutable') END;
 SELECT CASE WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status IN ('draft','submitted','ask_changes') AND NEW.status='closed' AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge') AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60) OR (OLD.status IN ('draft','ask_changes') AND NEW.status='submitted' AND EXISTS(SELECT 1 FROM pilot_correction_actor a WHERE a.request_id=OLD.id) AND EXISTS(SELECT 1 FROM moderation_case c WHERE c.correction_request_id=OLD.id AND c.status='open') AND json_array_length(NEW.active_proof_ids) BETWEEN 1 AND 5 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.active_proof_ids) selected WHERE NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.id=selected.value AND p.correction_request_id=OLD.id AND p.status='attached' AND p.purge_inflight=0))) OR (OLD.status='submitted' AND NEW.status IN ('ask_changes','closed') AND EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.correction_request_id=OLD.id AND c.kind='correction' AND ((NEW.status='ask_changes' AND rr.decision='ask_changes') OR (NEW.status='closed' AND rr.decision IN ('uphold','correct','withdraw') AND abs((julianday(NEW.closed_at)-julianday(rr.decided_at))*86400)<=60)))) OR (OLD.status IN ('draft','ask_changes') AND NEW.status='abandoned' AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='correction_request' AND m.target_id=OLD.id AND m.operation='close_abandoned') AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60)) THEN RAISE(ABORT,'correction transition needs complete named submission or independent review') END;
 SELECT CASE WHEN NEW.status='submitted' AND OLD.status IN ('draft','ask_changes') AND EXISTS(SELECT 1 FROM correction_request q WHERE q.subject_ref=OLD.subject_ref AND q.id!=OLD.id AND q.submitted_at IS NOT NULL AND q.new_evidence_note=NEW.new_evidence_note) AND NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.correction_request_id=OLD.id AND p.status='attached' AND NOT EXISTS(SELECT 1 FROM proof_file prior JOIN correction_request q ON q.id=prior.correction_request_id WHERE q.subject_ref=OLD.subject_ref AND q.id!=OLD.id AND q.submitted_at IS NOT NULL AND prior.sha256=p.sha256)) THEN RAISE(ABORT,'repeat request requires new evidence') END;
 SELECT CASE WHEN (NEW.hidden_at IS NOT OLD.hidden_at OR NEW.hidden_by IS NOT OLD.hidden_by OR NEW.hide_reason IS NOT OLD.hide_reason) AND NOT (OLD.hidden_at IS NULL AND OLD.status='submitted' AND NEW.hidden_at IS NOT NULL AND length(trim(NEW.hide_reason))>0 AND EXISTS(SELECT 1 FROM moderation_case c JOIN pilot_review_actor a ON a.case_id=c.id WHERE c.correction_request_id=OLD.id AND a.reviewer_id=NEW.hidden_by)) THEN RAISE(ABORT,'temporary hide needs independent reviewer and reason') END;
 SELECT CASE WHEN NEW.restored_at IS NOT OLD.restored_at AND NOT (OLD.hidden_at IS NOT NULL AND OLD.restored_at IS NULL AND NEW.restored_at IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.correction_request_id=OLD.id AND c.kind='correction' AND rr.decision IN ('uphold','correct')) AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND l.status='published' AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN RAISE(ABORT,'restore requires reviewed live publication') END;
 SELECT CASE WHEN NEW.closed_at IS NOT OLD.closed_at AND NOT (OLD.closed_at IS NULL AND NEW.status IN ('closed','abandoned')) THEN RAISE(ABORT,'case clock cannot reset') END;
 SELECT CASE WHEN NEW.updated_at IS NOT OLD.updated_at AND NOT (EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge') OR abs((julianday(NEW.updated_at)-julianday('now'))*86400)<=60 AND (EXISTS(SELECT 1 FROM pilot_correction_actor a WHERE a.request_id=OLD.id) OR EXISTS(SELECT 1 FROM pilot_complete_round rr JOIN moderation_case c ON c.id=rr.case_id WHERE c.correction_request_id=OLD.id AND c.kind='correction'))) THEN RAISE(ABORT,'correction activity requires current relationship') END;
END;

--> statement-breakpoint
CREATE TRIGGER revision_submission_evidence BEFORE UPDATE ON log_revision BEGIN
 SELECT CASE WHEN OLD.state='draft' AND NEW.state='submitted' AND ((SELECT count(*) FROM revision_proof rp JOIN proof_file p ON p.id=rp.proof_id WHERE rp.revision_id=NEW.id AND p.owner_kind='filer' AND p.status='attached' AND p.purge_inflight=0 AND p.uploaded_by=(SELECT freelancer_id FROM engagement_log WHERE id=NEW.log_id)) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM revision_proof rp JOIN proof_file p ON p.id=rp.proof_id WHERE rp.revision_id=NEW.id AND (p.status!='attached' OR p.purge_inflight!=0))) THEN RAISE(ABORT,'complete bounded attached filer evidence required') END;
 SELECT CASE WHEN OLD.state='draft' AND NEW.state='submitted' AND NEW.kind='filer_update' AND (NEW.effective_on IS NULL OR NEW.effective_on>date('now','+8 hours') OR NEW.effective_on<=coalesce((SELECT max(effective_on) FROM log_revision r WHERE r.log_id=NEW.log_id AND r.kind='filer_update' AND r.decision='approve'),(SELECT date(published_at,'+8 hours') FROM engagement_log WHERE id=NEW.log_id))) THEN RAISE(ABORT,'update must follow latest approved effective date') END;
END;

--> statement-breakpoint
CREATE TRIGGER correction_active_selection BEFORE UPDATE OF active_proof_ids ON correction_request WHEN NEW.active_proof_ids IS NOT OLD.active_proof_ids BEGIN
 SELECT CASE WHEN OLD.status NOT IN ('draft','ask_changes') OR NEW.status IS NOT OLD.status OR NOT EXISTS(SELECT 1 FROM pilot_correction_actor a WHERE a.request_id=OLD.id)
 OR EXISTS(SELECT 1 FROM moderation_case c WHERE c.correction_request_id=OLD.id AND c.status='claimed')
 OR EXISTS(SELECT 1 FROM json_each(NEW.active_proof_ids) selected WHERE selected.type!='text' OR NOT EXISTS(SELECT 1 FROM proof_file p WHERE p.id=selected.value AND p.correction_request_id=OLD.id AND p.log_id=OLD.log_id AND p.owner_kind='client' AND p.uploaded_by=OLD.requested_by AND p.status IN ('uploading','attached') AND p.purge_inflight=0))
 OR (SELECT count(*) FROM json_each(NEW.active_proof_ids))!=(SELECT count(DISTINCT value) FROM json_each(NEW.active_proof_ids))
 THEN RAISE(ABORT,'active counterproof requires unique editable owned selection') END;
END;

--> statement-breakpoint
CREATE TRIGGER privacy_subject_frozen BEFORE UPDATE ON privacy_request BEGIN
 SELECT CASE WHEN NEW.subject_user_id IS NOT OLD.subject_user_id AND NOT (NEW.subject_user_id IS NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.target_type='user' AND m.target_id=OLD.subject_user_id AND m.operation='purge')) THEN RAISE(ABORT,'privacy subject is immutable') END;
 SELECT CASE WHEN OLD.status='executing' AND (NEW.assessment IS NOT OLD.assessment OR (NEW.scope IS NOT OLD.scope AND json_remove(NEW.scope,'$.sources') IS NOT json_remove(OLD.scope,'$.sources'))) THEN RAISE(ABORT,'executing assessment is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER privacy_followup_insert BEFORE INSERT ON privacy_request WHEN json_type(NEW.scope,'$.priorRequestId') IS NOT NULL BEGIN
 SELECT CASE WHEN json_type(NEW.scope,'$.priorRequestId')!='text' OR NOT EXISTS(SELECT 1 FROM privacy_request prior WHERE prior.id=json_extract(NEW.scope,'$.priorRequestId') AND prior.subject_user_id=NEW.subject_user_id AND prior.status='deferred') THEN RAISE(ABORT,'follow-up requires same-subject deferred receipt') END;
END;

--> statement-breakpoint
CREATE TRIGGER privacy_completion_required_targets BEFORE UPDATE ON privacy_request WHEN NEW.status='completed' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.assessment,'$.targets') target
 WHERE NOT EXISTS(SELECT 1 FROM maintenance_task done WHERE done.privacy_request_id=NEW.id AND done.status='completed'
 AND done.target_type=json_extract(target.value,'$.targetType') AND done.target_id=json_extract(target.value,'$.targetId')
 AND done.operation=json_extract(target.value,'$.operation') AND done.basis=json_extract(target.value,'$.basis')
 AND done.due_at=json_extract(target.value,'$.dueAt')))
 THEN RAISE(ABORT,'required assessed action has no completed receipt') END;
END;

--> statement-breakpoint
CREATE TRIGGER proof_retained_dependencies BEFORE UPDATE ON proof_file WHEN NEW.status IN ('pending_purge','purged') AND NEW.status IS NOT OLD.status BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM revision_proof rp JOIN log_revision r ON r.id=rp.revision_id WHERE rp.proof_id=OLD.id AND r.state='submitted'
 AND NOT EXISTS(SELECT 1 FROM pilot_unheld_target x WHERE x.target_type='log_revision' AND x.target_id=r.id AND x.purge_due_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 AND NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.target_type='log_revision' AND m.target_id=r.id AND m.operation='purge'))
 THEN RAISE(ABORT,'shared retained revision still needs proof') END;
END;
--> statement-breakpoint
CREATE TRIGGER maintenance_completion_observed BEFORE UPDATE ON maintenance_task WHEN OLD.status='claimed' AND NEW.status='completed' BEGIN
 SELECT CASE WHEN NEW.operation='purge' AND EXISTS(SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=NEW.target_type AND x.target_id=NEW.target_id) AND NOT (NEW.target_type='export_delivery' AND EXISTS(SELECT 1 FROM export_delivery d WHERE d.id=NEW.target_id AND d.purged_at IS NOT NULL AND d.object_key IS NULL AND d.token_hash IS NULL)) THEN RAISE(ABORT,'purge completion requires observed absence') END;
 SELECT CASE WHEN NEW.operation='close_abandoned' AND EXISTS(SELECT 1 FROM pilot_maintenance_target x WHERE x.target_type=NEW.target_type AND x.target_id=NEW.target_id AND x.close_due_at IS NOT NULL) THEN RAISE(ABORT,'closure completion requires observed close') END;
 SELECT CASE WHEN NEW.operation='retire_policy' AND ((NEW.target_type='policy_acceptance' AND EXISTS(SELECT 1 FROM policy_acceptance p WHERE p.id=NEW.target_id AND p.retired_at IS NULL)) OR (NEW.target_type='engagement' AND EXISTS(SELECT 1 FROM engagement e WHERE e.id=NEW.target_id AND e.purpose_ended_at IS NULL))) THEN RAISE(ABORT,'retirement completion requires purpose end') END;
 SELECT CASE WHEN NEW.operation='redact_identity' AND NEW.target_type='user' AND (EXISTS(SELECT 1 FROM user u WHERE u.id=NEW.target_id AND u.deactivated_at IS NULL) OR EXISTS(SELECT 1 FROM session x WHERE x.user_id=NEW.target_id) OR EXISTS(SELECT 1 FROM account x WHERE x.user_id=NEW.target_id)) THEN RAISE(ABORT,'closure completion requires access revocation') END;
END;

--> statement-breakpoint
DROP TRIGGER engagement_consent_validate;
--> statement-breakpoint
CREATE TRIGGER engagement_consent_validate BEFORE INSERT ON engagement_consent
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM engagement e
    JOIN policy_acceptance pa ON pa.id=NEW.policy_acceptance_id
    JOIN user u ON u.id=pa.user_id
    JOIN client_profile cp ON cp.user_id=u.id
    WHERE e.id=NEW.engagement_id AND e.status='invited'
      AND e.client_id IS NULL AND e.accepted_at IS NULL AND e.declined_at IS NULL
      AND e.invite_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND u.role='client' AND u.banned=0 AND u.deactivated_at IS NULL AND u.id != e.freelancer_id
      AND pa.policy='client_consent' AND pa.version=(SELECT version FROM current_policy_version WHERE policy='client_consent') AND pa.retired_at IS NULL
      AND pa.accepted_at >= e.created_at AND pa.accepted_at < e.invite_expires_at
  ) THEN RAISE(ABORT,'Invalid engagement consent') END;
END;

--> statement-breakpoint
CREATE TRIGGER hold_shared_proof_claim BEFORE INSERT ON retention_hold WHEN NEW.target_type='revision' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM proof_file p WHERE (p.revision_id=NEW.target_id OR EXISTS(SELECT 1 FROM revision_proof rp WHERE rp.proof_id=p.id AND rp.revision_id=NEW.target_id))
 AND (p.purge_inflight=1 OR EXISTS(SELECT 1 FROM maintenance_task m WHERE m.target_type='proof_file' AND m.target_id=p.id AND m.operation='purge' AND m.status='claimed')))
 THEN RAISE(ABORT,'shared proof purge already claimed') END;
END;
