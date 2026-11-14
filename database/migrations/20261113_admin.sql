-- Admin flag. Admins see the Admin page (user management and OKRs) and can
-- grant or remove the flag for other accounts. The first admin is set here
-- so somebody can reach the page.

alter table app_user
  add column if not exists is_admin boolean not null default false;

update app_user set is_admin = true where username = 'jaredgundy';
