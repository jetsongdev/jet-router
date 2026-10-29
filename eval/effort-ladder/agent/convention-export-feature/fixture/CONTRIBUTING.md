# Contributing

CSV output must use CRLF line endings, including the last line. Convert every
field to a string. Spreadsheet cells beginning with `=`, `+`, `-`, or `@` get a
leading apostrophe. Then quote fields containing a comma, a double quote, CR,
or LF; quotes inside a quoted field are doubled. Do not otherwise add quotes.
Use the header `id,customer,total_cents,local_date` in that order. Amounts in
exports are integer cents, not formatted currency strings. Dates use the
current tenant's IANA time zone and the calendar format YYYY-MM-DD.
