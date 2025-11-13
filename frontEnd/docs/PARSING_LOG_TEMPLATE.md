# Parsing Log Template

## Usage
This template can be used to document parsing logs for future reference. Copy this template and fill in the actual log data when analyzing parsing results.

## Log Session Information
- **Date**: [YYYY-MM-DD]
- **Time**: [HH:MM:SS]
- **File Processed**: [filename.pdf]
- **Pages Processed**: [number]
- **Total Voters Found**: [number]
- **Processing Duration**: [duration]

## Raw OCR Text
```
[Paste the raw OCR text here]
```

## Address Extraction
```
Extracted Address: [address]
```

## Row-by-Row Processing

### Row 1
- **Headers**: [serial1 epic1 part1, serial2 epic2 part2, ...]
- **Content Preview**: [first 200 characters]

#### Name Extraction
- **Strategy 1 (Labeled)**: [count] names found
  - [raw_name] -> [cleaned_name]
  - [raw_name] -> [cleaned_name]
- **Strategy 2 (Unlabeled)**: [count] names found
  - [raw_name] -> [cleaned_name]
- **Final Names**: [array_of_final_names]

#### Relation Extraction
- **Found Relations**: [array_of_relations]

#### House Number Extraction
- **Main Pattern**: [count] houses found
  - [house_number]
- **Fallback Pattern**: [count] houses found
  - [raw_house] -> [cleaned_house]

#### Age/Gender Extraction
- **Found Age/Gender Pairs**: [count]
  - Age: [age], Raw Gender: [raw_gender] -> Clean: [clean_gender] -> Marathi: [marathi] -> English: [english]

#### Voter Matching
- **Voter 1 (Serial: [serial])**:
  - Name: [final_name] or [MISSING NAME]
  - Relation: [relation]
  - House: [house]
  - Age: [age]
  - Gender: [gender]
- **Voter 2 (Serial: [serial])**:
  - [same format]

### Row 2
[Repeat the same structure for each row]

## Summary Statistics
- **Total Rows Processed**: [count]
- **Total Voters Extracted**: [count]
- **Names Successfully Extracted**: [count]
- **Missing Names**: [count]
- **Houses Successfully Extracted**: [count]
- **Missing Houses**: [count]
- **Age/Gender Successfully Extracted**: [count]
- **Missing Age/Gender**: [count]

## Extraction Strategy Success Rates
- **Strategy 1 (Labeled Names)**: [percentage]% success
- **Strategy 2 (Unlabeled Names)**: [percentage]% success
- **Strategy 3 (Permissive)**: [percentage]% success
- **Strategy 4 (Aggressive)**: [percentage]% success
- **Strategy 5 (Segment-based)**: [percentage]% success
- **Strategy 6 (Truncated)**: [percentage]% success
- **Strategy 7 (Desperate)**: [percentage]% success

## Common Issues Encountered
- **OCR Errors**: [list of common OCR errors]
- **Pattern Failures**: [list of pattern matching failures]
- **Data Quality Issues**: [list of data quality problems]

## Recommendations for Improvement
- [suggestion 1]
- [suggestion 2]
- [suggestion 3]

## Raw Console Log Output
```
[Paste the complete console log output here]
```

## Notes
[Any additional notes or observations about the parsing process]
