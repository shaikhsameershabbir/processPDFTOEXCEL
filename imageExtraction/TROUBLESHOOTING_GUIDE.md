# Troubleshooting Guide for Preview/Download Issue

## Problem Description
When sharing the project, extraction works properly but preview and download options don't appear.

## Debugging Steps Added

I've added comprehensive logging to help identify the issue. Follow these steps:

### Step 1: Run the Application

```bash
cd backend\python-service
python app.py
```

Open browser: `http://localhost:5000`

### Step 2: Open Browser Console

Press `F12` to open developer tools, then go to the **Console** tab.

### Step 3: Upload and Extract PDF

1. Upload a PDF file
2. Configure grid settings
3. Click "Extract Vertically"
4. Watch the console for debug messages

### Step 4: Check Console Output

You should see these messages in order:

#### During Extraction:
```
✅ API Response received: { success: true, excelId: "...", recordsExtracted: 48, hasExtractedData: true, extractedDataLength: 48 }
✅ Extraction completed. Records: 48
✅ Extracted data available: 48 records
✅ Excel ID: <uuid>
✅ Showing preview section. Hidden class: true
✅ After removal. Hidden class: false
✅ Preview section shown. Data ready: 48 records
```

#### When Clicking Preview:
```
✅ Preview button clicked. Data available: 48
✅ Opening preview modal...
```

## Common Issues and Solutions

### Issue 1: No Data in Response

**Console shows:**
```
❌ hasExtractedData: false
❌ extractedDataLength: 0
```

**Possible causes:**
- Backend not returning data
- Data format mismatch
- Extraction failed silently

**Solution:**
1. Check Network tab for the `/api/extract-grid` response
2. Verify backend logs in the terminal
3. Check if `extract_grid_vertical()` returns proper format

### Issue 2: Preview Section Not Showing

**Console shows:**
```
❌ Hidden class: true (after removal)
❌ Preview section shown: 0 records
```

**Possible causes:**
- CSS conflict
- JavaScript error
- DOM element not found

**Solution:**
1. Check browser console for JavaScript errors
2. Inspect the preview section element in DevTools
3. Try scrolling down - section might be hidden off-screen

### Issue 3: Large Data Response (Base64 Images)

**Console shows:**
```
⚠️ Response very large (>50MB)
⚠️ Network timeout
```

**Possible causes:**
- Too many photos with high base64 data
- Server or browser timeout
- Memory issues

**Solution:**
1. Check Network tab response size
2. Look for timeout errors
3. Consider pagination or lazy loading
4. Implement chunked data loading

### Issue 4: Data Lost Between Steps

**Console shows:**
```
✅ Extraction: 48 records
❌ Preview: 0 records
```

**Possible causes:**
- `AppState.extractedData` being cleared
- Race condition
- Memory issue

**Solution:**
1. Check if data exists: `console.log(AppState.extractedData)`
2. Add breakpoint before preview
3. Verify no code is clearing `AppState`

## Manual Testing

### Test 1: Check API Response

In browser console after extraction:
```javascript
// Check if data is available
console.log('AppState:', AppState);
console.log('Extracted Data:', AppState.extractedData);
console.log('Excel ID:', AppState.excelId);
```

### Test 2: Manual Show Preview

Try manually removing hidden class:
```javascript
// Find the preview section
const previewSection = document.getElementById('previewSection');
console.log('Preview section:', previewSection);
console.log('Has hidden class:', previewSection.classList.contains('hidden'));

// Remove hidden class
previewSection.classList.remove('hidden');
console.log('After removal:', previewSection.classList.contains('hidden'));
```

### Test 3: Check Element Existence

Verify all required elements exist:
```javascript
const elements = {
    previewSection: document.getElementById('previewSection'),
    btnPreview: document.getElementById('btnPreview'),
    btnDownload: document.getElementById('btnDownload'),
    previewModal: document.getElementById('previewModal')
};

console.log('Elements found:', elements);
```

## Backend Debugging

### Check Backend Logs

Look at the terminal running the Flask server:
```bash
cd backend\python-service
python app.py
```

Look for these log messages:
```
INFO - Extraction completed: 48 records
INFO - Extraction time: 25.3s, API calls: 15
```

### Check Network Tab

1. Open Network tab in browser DevTools
2. Find the `/api/extract-grid` request
3. Click on it
4. Check:
   - Status code (should be 200)
   - Response body size
   - Time taken
   - Headers

### Test Backend Directly

```bash
cd backend\python-service
python app.py
```

In another terminal:
```bash
curl -X POST http://localhost:5000/api/extract-grid \
  -H "Content-Type: application/json" \
  -d '{"configId": "YOUR_CONFIG_ID"}' \
  -o response.json

# Check the response
python -c "import json; data=json.load(open('response.json')); print(f'Records: {len(data.get(\"extractedData\", []))}')"
```

## Files Modified for Debugging

1. **frontend/js/app.js** - Added console logs throughout extraction flow
2. **frontend/js/api.js** - Added API response logging
3. **PREVIEW_DOWNLOAD_FIX.md** - Detailed fix documentation

## Next Steps

Based on console output:

1. **If data is returned but not displayed:**
   - Check CSS/styling
   - Verify DOM manipulation
   - Check browser compatibility

2. **If data is not returned:**
   - Check backend extraction logic
   - Verify Excel generation
   - Check for errors in terminal

3. **If preview section exists but doesn't show:**
   - Check CSS conflicts
   - Verify element visibility
   - Check z-index issues

## Reporting Issues

When reporting issues, include:
1. Full console output
2. Network tab screenshot
3. Backend log output
4. Browser version and OS
5. Sample PDF (if shareable)

## Quick Fix Attempt

If you want to try a quick fix, add this to browser console after extraction:

```javascript
// Force show preview section
const section = document.getElementById('previewSection');
if (section) {
    section.classList.remove('hidden');
    section.style.display = 'block';
}
```

If this works, the issue is in the JavaScript logic. If not, it's likely a CSS or data issue.

## Summary

The debug logging will help identify exactly where the problem occurs. Run the extraction and share the console output for targeted fixes.
