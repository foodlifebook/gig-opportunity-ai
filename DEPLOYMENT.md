# Gig Opportunity AI - Deployment Guide

## Local Development

### Frontend Development
```bash
cd frontend
npm install
npm run dev
# Opens on http://localhost:5173
```

### Backend Development
```bash
cd backend
npm install
npm run dev
# Runs on http://localhost:4001
```

### Set up .env in backend/
```
DATABASE_URL=postgresql://postgres:[password]@[project].supabase.co:5432/postgres?sslmode=require
GEMINI_API_KEY=your_key
BIGMODEL_API_KEY=your_key
FRONTEND_URL=http://localhost:5173
PORT=4001
```

---

## Deploy to Vercel (All-in-One)

### Step 1: Ensure Everything is Pushed to GitHub
```bash
git add .
git commit -m "Update for Vercel deployment"
git push
```

### Step 2: Connect to Vercel
1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Select your GitHub repository `gig-opportunity-ai`
4. Click **"Import"**

### Step 3: Configure Environment Variables
In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```
DATABASE_URL = postgresql://postgres:[YOUR-SUPABASE-PASSWORD]@[your-project].supabase.co:5432/postgres?sslmode=require
GEMINI_API_KEY = your_gemini_key
BIGMODEL_API_KEY = your_bigmodel_key
FRONTEND_URL = https://[your-project-name].vercel.app
```

### Step 4: Deploy
- Click **"Deploy"**
- Vercel will:
  - Detect the project structure
  - Build frontend from `/frontend`
  - Build backend from `/api`
  - Deploy everything

### Step 5: Verify
- Frontend will be available at: `https://[your-project-name].vercel.app`
- Backend API at: `https://[your-project-name].vercel.app/api/`
- Database connected to: Supabase

---

## Important Notes

### Vercel Limitations
- ⚠️ **Timeout**: 10 seconds (upgrade to Pro for 60 seconds)
- ⚠️ **Cold starts**: First request may take 2-5 seconds
- ✅ **Supabase connection**: Handled automatically
- ✅ **CORS**: Already configured

### If You Have Issues
1. Check Vercel logs: Dashboard → Project → Deployments → Click latest → Logs
2. Verify environment variables are set
3. Test database connection: `https://[your-app].vercel.app/api/health`
4. Check that `DATABASE_URL` is correct from Supabase

---

## Future Updates
Simply push to GitHub, and Vercel will automatically redeploy!
```bash
git add .
git commit -m "Your changes"
git push
```
