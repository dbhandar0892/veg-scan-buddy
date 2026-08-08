# VegCheck Scan

Build "VegCheck" – The Most Trusted Vegan & Vegetarian Food Scanner

Project Overview

Build a beautiful, modern mobile-first Progressive Web App (PWA) called VegCheck.

The app has one purpose and should do that one thing exceptionally well:

Instantly tell users whether a food product is Vegan, Vegetarian, or Neither.

This is NOT a calorie tracker.

This is NOT a nutrition app.

This is NOT a meal planner.

This is NOT a recipe app.

This is NOT a health score app.

The entire experience revolves around answering one simple question:

"Can I eat this if I'm vegan or vegetarian?"

Everything in the app should reinforce this mission.

The design philosophy is:

Fast

Clean

Trustworthy

Friendly

Minimal

Zero clutter

The answer should be available within seconds.

Primary Goal

Users should be able to:

Scan a barcode

Take a picture of the ingredient label

Search by product name

The app instantly analyzes the product and returns one of four results:

🟢 Vegan

🟢 Vegetarian

🔴 Not Vegetarian

🟡 Unable to Confirm

Never guess.

If information is uncertain, clearly tell the user instead of making assumptions.

Trust is more important than appearing intelligent.

Core Features

1. Barcode Scanner

Allow users to scan any product barcode.

Look up the product using a food database API.

If found:

Retrieve:

Product name

Brand

Ingredient list

Product image

Category

Analyze ingredients.

2. Ingredient Photo Scanner

Users can photograph the ingredient label.

Use OCR to extract text.

Clean the OCR result automatically.

Analyze the ingredients using AI.

3. Product Search

Search by:

Product name

Brand

UPC (optional)

Show matching products.

AI Analysis

AI should classify products into exactly one status.

Vegan

Example:

🟢 Vegan

Explanation:

No animal-derived ingredients were detected.

Vegetarian

Example:

🟢 Vegetarian

❌ Not Vegan

Explanation:

Contains milk but no animal-derived rennet or meat ingredients.

Not Vegetarian

Example:

🔴 Not Vegetarian

Explanation:

Contains animal rennet used to make cheese.

Another example:

Contains gelatin made from animal collagen.

Another example:

Contains carmine, a coloring made from insects.

Keep explanations under 20 words whenever possible.

Simple English only.

No scientific jargon.

Unable to Confirm

Example:

🟡 Unable to Confirm

Explanation:

The manufacturer does not specify whether the enzymes are animal or microbial.

Never pretend to know.

Honesty builds trust.

Confidence Score

Display a confidence score.

Example:

98%

Very High Confidence

or

74%

Moderate Confidence

Only reduce confidence when ingredient sourcing is uncertain.

Ingredient Intelligence

Create a comprehensive ingredient knowledge base.

Every ingredient should contain:

Name

Vegan?

Vegetarian?

Category

Source

Short explanation

Example:

Animal Rennet

Vegetarian: No

Vegan: No

Explanation:

"Made from the stomach lining of young calves."

Microbial Rennet

Vegetarian: Yes

Vegan: No

Explanation:

"Produced by microorganisms instead of animals."

Gelatin

Vegetarian: No

Vegan: No

Explanation:

"Made from animal collagen."

Carmine

Vegetarian: No

Vegan: No

Explanation:

"Red coloring made from insects."

Beeswax

Vegetarian: Yes

Vegan: No

Explanation:

"Produced by honeybees."

Shellac

Vegetarian: No

Vegan: No

Explanation:

"Made from resin secreted by lac insects."

Enzymes

Status:

Unknown

Explanation:

"Can come from plants, microbes, or animals depending on the manufacturer."

Natural Flavors

Status:

Unknown

Explanation:

"The source is often not disclosed."

The ingredient database should be easy to expand.

Result Screen

Large status indicator.

Example

🟢 VEGAN

or

🟢 VEGETARIAN

or

🔴 NOT VEGETARIAN

Below that:

One simple explanation.

Example:

Contains animal rennet.

Below that:

Confidence score.

Below that:

Ingredients of Interest

Example

Milk

Microbial Rennet

Gelatin

Natural Flavors

Each ingredient should display a small badge:

Plant

Animal

Microbial

Unknown

Users can tap an ingredient to learn more.

Ingredient Detail Page

When users tap an ingredient:

Display:

What it is

Where it comes from

Whether it is Vegan

Whether it is Vegetarian

Why

Examples of products containing it

Keep explanations concise and beginner-friendly.

Scan History

Save recent scans.

Allow users to search history.

Allow deleting entries.

Favorites

Allow users to save favorite products.

Useful for repeat grocery purchases.

Community Verification (Future Ready)

Design the database so future versions can support:

Verified by Manufacturer

Community Verified

Updated Recently

Do not build submission functionality yet.

Just prepare the data structure.

User Experience

The app should feel incredibly fast.

Open app.

Tap Scan.

Get answer.

Under 3 seconds whenever possible.

Avoid unnecessary animations.

Avoid excessive text.

Visual Design

Minimalist.

Modern.

Rounded cards.

Large typography.

Excellent spacing.

Green accent color.

Red for warnings.

Yellow for uncertainty.

Use subtle shadows.

Premium feel.

Think Apple-level simplicity.

Navigation

Bottom navigation.

Home

Scan

History

Favorites

Settings

Home Screen

Large Scan button.

Search bar.

Recent scans.

Nothing else.

No dashboard.

No charts.

No distractions.

Settings

Dark Mode

Language

Privacy Policy

Terms

About

Feedback

Rate App

Future Architecture

Design the backend so additional dietary preferences can be added later without changing the database structure.

Do not expose these features in Version 1.

The MVP focuses ONLY on:

Vegan

Vegetarian

No Halal.

No Kosher.

No Allergies.

No Nutrition Scores.

No Carbon Footprint.

No Recipes.

No Meal Planning.

Maintain laser focus.

Technical Stack

Use:

Lovable

Supabase

Deno Edge Functions

PostgreSQL

OCR for ingredient label extraction

AI for ingredient analysis and explanation generation

Barcode lookup API for product information

Structure the code to be modular, scalable, and easy to maintain.

Product Philosophy

This app should become the most trusted vegan and vegetarian scanner in the world.

Every design decision should answer this question:

Does this help users quickly and confidently decide whether they can eat this product?

If the answer is no, do not build it.

The app wins by doing one thing better than anyone else—not by adding more features.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://veg-scan-buddy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5b2feb78-445e-4db0-baed-4a02ff5048aa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
