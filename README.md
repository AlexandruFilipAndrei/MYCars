# MYCars

MYCars este o aplicație web pentru administrarea unei flote auto, construită pentru a centraliza informațiile importante despre mașini, documente, închirieri, reparații și accesul colaboratorilor.

## Acces online

Aplicația este disponibilă aici:

`https://mycars-six.vercel.app/`

## Ce poți face în aplicație

- gestionezi mașinile din flotă
- adaugi și urmărești documente auto precum ITP, RCA sau alte acte
- primești notificări pentru documente care expiră
- înregistrezi închirieri și urmărești statusul mașinilor
- gestionezi reparații, mentenanță și documente asociate
- vezi statistici relevante pentru flotă
- inviți alți utilizatori să aibă acces la flotă
- testezi aplicația și în modul demo

## Tehnologii folosite

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase
- Zustand
- React Router
- React Hook Form + Zod
- Recharts
- Radix UI

## Rulare locală

1. Instalează dependențele:

```bash
npm install
```

2. Creează fișierul `.env` pornind de la `.env.example`.

3. Completează variabilele de mediu:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

4. Pornește serverul de dezvoltare:

```bash
npm run dev
```

## Scripturi disponibile

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Configurare Supabase

Pentru autentificare reală, persistența datelor și încărcarea documentelor sau imaginilor, aplicația are nevoie de un proiect Supabase configurat corect.

Variabile necesare:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Dacă aceste variabile nu sunt configurate, aplicația poate fi explorată în continuare folosind modul demo.

## Deploy

Proiectul este pregătit pentru deploy pe Vercel. Configurația existentă folosește build-ul Vite și reguli de rewrite pentru rutarea din aplicația SPA.

## Observații

- Modul demo folosește date locale și nu salvează informațiile într-o bază de date reală.
- Pentru producție, Supabase trebuie configurat atât pentru autentificare, cât și pentru storage.
