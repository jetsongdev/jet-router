# Audit actions

Successful order exports write exactly one `orders.export` entry through the
shared audit helper. Errors and forbidden requests do not write an entry.
