# Data files for ingestion

Download from [Inside Airbnb](http://insideairbnb.com/get-the-data/). Use **two cities** (recommended: **Lisbon, Portugal** and **Barcelona, Spain**).

For each city, download and place files exactly as below.

## Lisbon

```
data/raw/lisbon/listings.csv.gz
data/raw/lisbon/calendar.csv.gz
data/raw/lisbon/reviews.csv.gz
data/raw/lisbon/neighbourhoods.geojson
```

## Barcelona

```
data/raw/barcelona/listings.csv.gz
data/raw/barcelona/calendar.csv.gz
data/raw/barcelona/reviews.csv.gz
data/raw/barcelona/neighbourhoods.geojson
```

## Notes

- File names must match after gunzip is **not** required for ingest (we read `.gz` directly).
- `neighbourhoods.geojson` is optional but recommended for neighbourhood context on listings.
- Total size per city is large (calendar + reviews are biggest); allow several GB disk space.
- After files are in place, run: `yarn ingest`

## Minimum scale (assignment)

Across both cities combined you need **50,000+ listings** and **200,000+ reviews**. Lisbon alone usually exceeds this.
