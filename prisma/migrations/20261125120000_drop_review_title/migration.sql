-- The title of a review is dropped (issue #20): one field too many in the form. The titles
-- already written are lost; down.sql brings the column back, empty.
ALTER TABLE "Review" DROP COLUMN "title";
