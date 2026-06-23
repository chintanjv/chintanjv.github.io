# Personal Portfolio

A minimalistic, fast-loading personal portfolio website hosted on GitHub Pages.

---

## 🚀 How to deploy (step by step)

### Step 1 — Create a GitHub account
Go to [github.com](https://github.com) and create a free account if you don't have one.

### Step 2 — Create a new repository
1. Click the **+** icon in the top right → **New repository**
2. Name it exactly: `yourusername.github.io`
   - Replace `yourusername` with your actual GitHub username
   - Example: if your username is `kayne`, name it `kayne.github.io`
3. Set it to **Public**
4. Click **Create repository**

### Step 3 — Upload your files
**Option A (easiest): GitHub web upload**
1. Open your new repository on GitHub
2. Click **Add file** → **Upload files**
3. Drag the entire contents of this folder into the upload area
4. Click **Commit changes**

**Option B: GitHub Desktop app**
1. Download [GitHub Desktop](https://desktop.github.com/) (free)
2. Clone your repository to your computer
3. Copy all these files into the cloned folder
4. Click **Commit to main** → **Push origin**

### Step 4 — Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar)
4. Under **Source**, select **Deploy from a branch**
5. Under **Branch**, select `main` and `/ (root)`
6. Click **Save**

### Step 5 — Your site is live!
Wait about 2 minutes, then visit: `https://yourusername.github.io`

---

## ✏️ How to update your content

### Add or edit projects
1. Go to your GitHub repository
2. Open the file `data/projects.json`
3. Click the **pencil icon** (Edit this file)
4. Add, edit, or delete entries — follow the existing format
5. Click **Commit changes**

**Project entry format:**
```json
{
  "slug": "my-project-name",
  "title": "My Project Title",
  "summary": "One or two sentences shown on the homepage card.",
  "body": "<p>Full description in HTML. Use &lt;h2&gt; for sections.</p>",
  "link": "https://link-to-project.com",
  "github": "https://github.com/you/repo",
  "cover": "",
  "tags": ["Tag1", "Tag2"],
  "featured": true
}
```

- `slug`: URL-safe name, no spaces (use hyphens). Must match the filename in `/projects/`
- `cover`: Leave as `""` for no image, or add a path like `"assets/images/myproject.jpg"`
- `featured`: `true` shows it first; `false` shows it after featured items

### Add or edit blog posts

1. Open `data/thoughts.json`
2. Click the pencil icon
3. Add a new entry at the top of the list (newest first)
4. Commit changes

**Thought entry format:**
```json
{
  "slug": "my-post-title",
  "title": "My Post Title",
  "summary": "The excerpt shown on the homepage.",
  "date": "2025-06-01",
  "tags": ["Topic1", "Topic2"],
  "body": "<p>Full post content in HTML.</p><h2>A heading</h2><p>More text.</p>"
}
```

5. Create the actual post page by copying `thoughts/building-first-ios-app.html`
6. Rename it to `thoughts/my-post-title.html` (matching your slug)
7. Edit the title, date, tags, and body content inside the file

### Update your profile

Open `index.html` and find the `<!-- PROFILE -->` section:
- **Name**: Change the text in `<h1 class="profile-name">`
- **Role**: Change the text in `<p class="profile-role">`
- **Bio**: Change the text in `<p class="profile-bio">`
- **Social links**: Replace `href="#"` with your actual profile URLs

### Replace your profile photo
1. Save your photo as `assets/images/profile.jpg` (square, at least 200×200px)
2. Open `index.html`
3. Delete the line: `<div class="profile-photo-placeholder" ...>`
4. Uncomment the `<img>` line below it (remove the `<!--` and `-->`)

---

## 🌐 Custom domain (optional)

1. Buy a domain at [Namecheap](https://namecheap.com) (~$12/year) or [Cloudflare](https://cloudflare.com/registrar)
2. In your domain's DNS settings, add:
   - Type: `CNAME`
   - Name: `www`
   - Value: `yourusername.github.io`
3. For the root domain, add 4 A records pointing to GitHub's IPs:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
4. In GitHub → Settings → Pages → Custom domain: enter your domain
5. Check **Enforce HTTPS**
6. Wait up to 24 hours for DNS to propagate

---

## 📁 File structure

```
/
├── index.html              ← Homepage
├── data/
│   ├── projects.json       ← Edit this to manage projects ✏️
│   └── thoughts.json       ← Edit this to manage posts ✏️
├── assets/
│   ├── css/style.css       ← All styles
│   ├── js/main.js          ← Renders content from JSON
│   └── images/             ← Drop your images here
│       └── profile.jpg
├── projects/
│   └── [slug].html         ← One file per project
└── thoughts/
    └── [slug].html         ← One file per blog post
```

---

## 🎨 Customization

### Change colors
Open `assets/css/style.css` and edit the `:root` variables at the top:

```css
:root {
  --color-accent: #2563eb;    /* Link/hover color */
  --color-card-bg: #f7f6f3;  /* Project card background */
}
```

### Change fonts
The site uses:
- **Instrument Serif** — your name display (one place only)
- **Inter** — everything else

To change, update the Google Fonts link in `index.html` and the `:root` font variables in `style.css`.

---

Built with plain HTML, CSS, and JavaScript. No framework, no build step, no dependencies.
