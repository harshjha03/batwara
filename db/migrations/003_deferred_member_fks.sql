-- 003: deleting a group cascades to both its members and its expense rows in one statement;
-- immediate FK checks on member refs fire mid-cascade and block it. Check them at commit instead.
-- Removing a ghost who still has expenses is still refused (the check just runs at commit).
alter table expenses alter constraint expenses_paid_by_group_id_fkey deferrable initially deferred;
alter table expense_splits alter constraint expense_splits_member_id_fkey deferrable initially deferred;
alter table settlements alter constraint settlements_from_member_group_id_fkey deferrable initially deferred;
alter table settlements alter constraint settlements_to_member_group_id_fkey deferrable initially deferred;
