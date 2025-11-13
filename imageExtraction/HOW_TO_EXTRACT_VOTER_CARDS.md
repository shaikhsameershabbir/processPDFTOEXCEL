# 📘 How to Extract Voter Cards (Photo on RIGHT Layout)

This guide is specifically for voter ID cards where **photos are on the RIGHT side**, like in your images.

---

## 🎯 Your Layout (From Images)

```
┌─────────────────────────────────────┐
│  Name: Kumar Surendra          📷   │
│  Voter ID: ABC1234567          📷   │
│  Age: 32                       📷   │
│  Address: ...                  📷   │
│                                📷   │
│  ← Voter Info (LEFT)    Photo (RIGHT) →
└─────────────────────────────────────┘
```

---

## ⚡ QUICK METHOD (Recommended!)

### Step 1: Upload PDF
1. Click **"Choose PDF File"**
2. Select your voter list PDF
3. Wait for upload to complete ✓

### Step 2: Draw Grid
1. Set **Rows**: 9 (or count rows in your PDF)
2. Set **Columns**: 3 (or count columns in your PDF)
3. Click **"Draw Grid Manually"**
4. **Adjust the grid**:
   - **Drag blue corner handles** to resize
   - **Drag center** to move entire grid
   - **Drag individual lines** to adjust spacing
   - **Arrow keys** for precise positioning

### Step 3: Apply Quick Template
1. Click **"Quick Template (Photo Right)"** button ⚡
2. Done! The system automatically creates:
   - **Voter ID box** on LEFT (60% of cell)
   - **Photo box** on RIGHT (35% of cell)

### Step 4: Extract Data
1. Click **"Extract Vertically"**
2. Wait for extraction to complete
3. Click **"Preview Data"** to verify
4. Click **"Download Excel"** to save

**Time required: 2-3 minutes for entire PDF!**

---

## 🎨 MANUAL METHOD (For Custom Layouts)

If your layout is different or you need precise control:

### Step 1-2: Same as above (Upload PDF & Draw Grid)

### Step 3: Define Template Manually
1. Click **"Start Template Mode"**
2. **Draw Voter ID Box**:
   - Press `V` key on keyboard
   - Click and drag on the **FIRST CELL** (top-left) where voter ID text is
   - Draw a box around the voter ID area
3. **Draw Photo Box**:
   - Press `P` key on keyboard  
   - Click and drag where the photo is
   - Draw a box around the photo area
4. Click **"Apply Template to All"**

### Step 4: Extract (Same as Quick Method)

---

## 📐 Understanding the Grid System

### How It Works:
1. **Grid** = Divides your PDF page into cells
2. **Template** = Defines boxes WITHIN each cell
3. **Extraction** = Applies template to ALL cells

### Example:
```
PDF Page (A4)
┌─────────────────────────────────────────────┐
│ Header (skip)                               │
├───────────┬───────────┬───────────┐
│ Cell 1    │ Cell 2    │ Cell 3    │ ← Row 1
│  [ID] [📷]│  [ID] [📷]│  [ID] [📷]│
├───────────┼───────────┼───────────┤
│ Cell 4    │ Cell 5    │ Cell 6    │ ← Row 2
│  [ID] [📷]│  [ID] [📷]│  [ID] [📷]│
├───────────┼───────────┼───────────┤
│ Cell 7    │ Cell 8    │ Cell 9    │ ← Row 3
│  [ID] [📷]│  [ID] [📷]│  [ID] [📷]│
└───────────┴───────────┴───────────┘
│ Footer (skip)                               │
└─────────────────────────────────────────────┘
```

You define [ID] and [📷] boxes in **Cell 1**, system applies to all cells!

---

## 🔧 Fine-Tuning Your Extraction

### Adjust Grid Spacing (For Unequal Cells)
- **Drag vertical lines** (between columns) left/right
- **Drag horizontal lines** (between rows) up/down
- This is useful if cells have different widths/heights

### Skip Headers & Footers
1. Set **"Skip Pages from Start"**: Skip first N pages
2. Set **"Skip Pages from End"**: Skip last N pages
3. Set **"Header Height"**: Skip top N pixels
4. Set **"Footer Height"**: Skip bottom N pixels

### Adjust Template Boxes
After drawing manually:
- **Redraw**: Click "Start Template Mode" again
- **Fine-tune**: Use arrow keys to nudge grid position

---

## 💡 Tips for Your Specific Layout

### Since Your Photos Are On The RIGHT:
✅ **Quick Template** automatically positions:
- Voter ID box: **5-60% from left** (covers text area)
- Photo box: **62-95% from left** (covers photo area)

### If Quick Template Doesn't Fit:
1. Click **"Start Template Mode"**
2. Draw boxes manually in first cell
3. Make sure:
   - **Voter ID box** captures the full text area (name, ID, age, address)
   - **Photo box** captures the entire photo (with margin)

### For Best Results:
- **Grid should fit snugly** around the actual cells
- **Leave small margins** (5-10px) inside template boxes
- **Test on 1 page first**: Use "Skip Pages from End" to process only first page

---

## 📊 Extraction Output

### Excel File Contains:
| Page | Row | Column | Voter ID | Photo | Confidence |
|------|-----|--------|----------|-------|------------|
| 1    | 1   | 1      | ABC1234567 | (embedded) | 95% |
| 1    | 1   | 2      | XYZ7654321 | (embedded) | 92% |
| ...  | ... | ...    | ...      | ...   | ...        |

- **Voter ID**: Extracted text (cleaned and formatted)
- **Photo**: Embedded image in Excel (viewable)
- **Confidence**: OCR confidence score (0-100%)

### Extraction Order:
**VERTICAL** (Column-by-Column):
```
Column 1: Cells 1, 4, 7, 10, 13, ...
Column 2: Cells 2, 5, 8, 11, 14, ...
Column 3: Cells 3, 6, 9, 12, 15, ...
```

---

## 🐛 Troubleshooting

### Problem: Grid doesn't align with cards
**Solution**: 
- Use **mouse drag** to adjust individual lines
- Use **arrow keys** for fine movement
- **Resize** from corners if overall size is wrong

### Problem: Photos are cropped or missing
**Solution**:
- Make **photo box larger** in template
- Try **Quick Template** - it uses 70% of cell height for photos
- Ensure photo box includes full photo with margin

### Problem: Wrong voter IDs extracted
**Solution**:
- Make **voter ID box** cover entire text area
- Check if text is in Hindi - may need Hindi language support
- Use **higher DPI** (400 DPI default is best)

### Problem: Some cells are empty
**Solution**:
- Check if grid is **misaligned** - adjust lines
- Some cards might genuinely be blank
- Check **skip zones** - might be cutting off valid cells

---

## 🎯 Workflow Summary

### For 100-Page Document:
1. **Upload**: 10 seconds
2. **Draw Grid**: 30 seconds  
3. **Quick Template**: 1 click (2 seconds)
4. **Extract**: 2-3 minutes (automatic)
5. **Download**: 5 seconds

**Total**: ~4 minutes for entire document!

### What You Need:
- ✅ PDF file with voter cards
- ✅ Server running (`START_SERVER.bat`)
- ✅ Browser (Chrome/Firefox/Edge)
- ✅ 2-3 minutes of your time

---

## 🚀 Advanced Features

### Auto-Detection with Azure Vision (Optional)
If you configured Azure API keys:
1. Click **"Auto-Detect with Azure Vision"**
2. AI automatically detects:
   - Grid structure
   - Voter ID boxes
   - Photo boxes
3. Review and adjust if needed
4. Extract!

**Cost**: ~$0.001 per page with Azure  
**Benefit**: Fully automatic, no manual drawing

### Background Processing (For Large PDFs)
For PDFs with 20+ pages:
1. System automatically uses **async processing**
2. Shows progress percentage
3. Download when complete
4. No timeout issues!

---

## 📸 Visual Reference

### Your Image Shows:
```
ROW 1: [278] [ABC1234567] [📷]  [279] [XYZ2468101] [📷]  [280] [PQR9753186] [📷]
ROW 2: [281] [NOW4528907] [📷]  [282] [KUV4528899] [📷]  [283] [HIJ3445707] [📷]
ROW 3: [284] [HHW1900323] [📷]  [285] [NOW4511531] [📷]  [286] [NOW4224960] [📷]
```

**Layout**: 3 columns × 9 rows = 27 cards per page

**Quick Template creates**:
```
Cell:
┌─────────────────────────────┐
│ [Voter ID Box]     [Photo]  │
│  Name: ...         [  📷  ] │
│  ID: ABC1234567    [  📷  ] │
│  Age: 32           [  📷  ] │
│  Address: ...      [  📷  ] │
│                    [     ] │
│ ← 60% width → ← 35% width →│
└─────────────────────────────┘
```

---

## ✅ Checklist Before Extraction

- [ ] PDF uploaded successfully
- [ ] Grid drawn and aligned with cells
- [ ] Template applied (Quick or Manual)
- [ ] Tested on first page (use skip settings)
- [ ] Header/footer heights set correctly
- [ ] Blue voter ID boxes visible on all cells
- [ ] Green photo boxes visible on all cells
- [ ] "Extract Vertically" button enabled

**Ready to extract? Click the button!** 🚀

---

## 🎉 Final Notes

### Your System Extracts ONLY From Drawn Boxes:
- ✅ Respects your manually drawn grid
- ✅ Uses your template boxes (Voter ID + Photo)
- ✅ Scales template to fit each cell size
- ✅ Extracts in vertical order (column-by-column)

### The System Does NOT:
- ❌ Randomly detect regions (unless you use Azure Auto-Detect)
- ❌ Override your manual boxes
- ❌ Change your grid positions
- ❌ Guess where to extract from

**You are in full control!**

---

Need help? Check server logs at: `backend/python-service/app.log`

