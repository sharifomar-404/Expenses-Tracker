# Expense Tracker

A bilingual (English / Arabic) expense tracker built with plain HTML, CSS and JavaScript — no frameworks, no backend. All data stays in the browser.

**Live demo:** https://YOUR-USERNAME.github.io/expense-tracker/

> Tip: click **Load sample data** in the footer to see the dashboard filled in.

 Features

- **Dashboard** — income, spending, balance left and a monthly budget bar, a spending-by-category donut chart, upcoming bills and the latest transactions
- **Transactions** — search, filter by type and category, edit or delete with undo, and export to CSV
- **Bills** — recurring bills with status badges, overdue alerts, *Mark as paid* (logs the expense and moves the due date forward) and *Add to calendar* (.ics file with a reminder)
- **Stats** — daily average, biggest expense, comparison with last month, a six-month income vs spending chart and top categories
- **Receipts** — attach a photo or PDF to any expense; images are compressed before saving
- **Two currencies** — record each expense in USD or SAR and view everything in either (fixed rate 1 USD = 3.75 SAR)
- **English and Arabic** — full right-to-left layout, Arabic fonts and translated dates and numbers
- **Light and dark mode**, plus an adjustable "card glass" effect
- **Responsive** — sidebar on desktop, bottom tab bar and bottom sheet on phones

Built with

- Semantic HTML (`<dialog>`, `<details>`, `<template>`, forms with real labels)
- CSS custom properties for theming, CSS Grid and Flexbox, logical properties for RTL, `color-mix()`, `:has()` and `backdrop-filter`
- Vanilla JavaScript with event delegation and the `Intl` APIs for money, dates and relative times
- `localStorage` for data and settings, IndexedDB for receipt files

Accessibility

Keyboard-friendly dialogs and shortcuts (`N` to add, `Esc` to close), visible focus styles, screen-reader labels on icon buttons and charts, live announcements for search results and toasts, and support for reduced motion.

Run it locally

No build step. Open the folder in VS Code and start it with the **Live Server** extension, or open `index.html` in a browser.

Privacy

Everything is stored only in your own browser. Nothing is sent to a server.
