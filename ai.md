# NSFW Image Filter Setup & Integration Guide

## Overview

This guide walks you through:

1. Setting up a local NSFW classification model
2. Running it in Python
3. Applying custom moderation rules
4. Integrating it into your platform

---

## 1. Environment Setup

### Create project

```bash
mkdir nsfw-filter
cd nsfw-filter
```

### Create virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### Install dependencies

```bash
python -m pip install torch transformers pillow "numpy<2"
pip install "transformers<5"
```

---

## 2. Model Setup

We use:
**strangerguardhf/nsfw_image_detection**

### Create `main.py`

```python
from transformers import AutoImageProcessor, SiglipForImageClassification
from PIL import Image
import torch

model_name = "strangerguardhf/nsfw_image_detection"

print("Loading model...")
model = SiglipForImageClassification.from_pretrained(model_name)
processor = AutoImageProcessor.from_pretrained(model_name)

image_path = "test.jpg"
image = Image.open(image_path).convert("RGB")

inputs = processor(images=image, return_tensors="pt")

with torch.no_grad():
    outputs = model(**inputs)

probs = torch.nn.functional.softmax(outputs.logits, dim=1)[0]
labels = model.config.id2label

print("\nResults:")
for i, prob in enumerate(probs):
    print(f"{labels[i]}: {prob.item():.4f}")
```

---

## 3. Run the Model

Place an image in your folder:

```
test.jpg
```

Run:

```bash
python main.py
```

---

## 4. Convert to Reusable Function

```python
from transformers import AutoImageProcessor, SiglipForImageClassification
from PIL import Image
import torch

model_name = "strangerguardhf/nsfw_image_detection"

model = SiglipForImageClassification.from_pretrained(model_name)
processor = AutoImageProcessor.from_pretrained(model_name)

def classify_image(image_path):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.nn.functional.softmax(outputs.logits, dim=1)[0]
    labels = model.config.id2label

    return {labels[i]: probs[i].item() for i in range(len(labels))}
```

---

## 5. Add Moderation Rules

```python
def moderate(results):
    porn = results["Pornography"]
    sensual = results["Enticing or Sensual"]
    normal = results["Normal"]

    if porn > 0.5:
        return "block"

    elif sensual > 0.7:
        return "allow"

    elif normal > 0.6:
        return "allow"

    return "review"
```

---

## 6. Example Usage

```python
results = classify_image("test.jpg")
decision = moderate(results)

print("Decision:", decision)
print("Scores:", results)
```

---

## 7. Integration Into Your Platform

### Backend API Example (FastAPI-style)

```python
@app.post("/check-image")
def check_image(file: UploadFile):
    path = save_temp(file)

    results = classify_image(path)
    decision = moderate(results)

    return {
        "decision": decision,
        "scores": results
    }
```

---

### Batch Processing

```python
for img in images:
    results = classify_image(img)
    decision = moderate(results)
```

---

## 8. Important Notes

### Load model only once

Do NOT load inside functions repeatedly.

### Performance

* First run: slow (downloads model)
* After: fast (~100–300ms per image)

### Memory

* Model uses ~300–400MB RAM

---

## 9. Testing Strategy

Test with:

* normal images
* nudity (non-sexual)
* explicit content
* gym / bikini
* memes / edge cases

Adjust thresholds based on results.

---

## 10. Architecture Summary

```
Image → Model → Probabilities → Rules → Decision
```

---

## 11. Next Steps (Optional)

* Build UI (drag & drop)
* Add logging for model outputs
* Tune thresholds
* Combine multiple models
* Fine-tune model with your own dataset

---

## Done ✅

You now have a working local NSFW moderation system with custom rules.
