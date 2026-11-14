-- Application encryption adds nonce/tag and base64 overhead to these values.
-- Keep the ERD's existing relationships and fields, but allow the ciphertext.
alter table connected_account
  alter column access_token type text using access_token::text;

alter table course
  alter column ics_feed_url type text using ics_feed_url::text;
