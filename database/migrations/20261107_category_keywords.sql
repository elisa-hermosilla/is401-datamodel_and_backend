-- Keyword routing for Learning Suite categories.
-- Lowercase phrases; a feed item whose title/category/first line contains one
-- of them lands in this category on every sync. Empty = no keyword routing
-- (the item falls back to the regex buckets). Filled in by the "Categorize
-- using AI" step or edited by the student in the class modal.

alter table assignment_category
  add column if not exists match_keywords text[] not null default '{}';
