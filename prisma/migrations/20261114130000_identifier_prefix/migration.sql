-- Code prefixes typed in the search (« 2500101 » → 2500101KDKQN, « 0442953 » → UAI): LIKE 'x%'
-- needs an operator class that orders text bytewise (the default btree follows the collation).
CREATE INDEX "Identifier_value_pattern_idx" ON "Identifier" (value text_pattern_ops);
