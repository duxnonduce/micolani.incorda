# Micolani Incorda

Gestione interna delle incordature: segreteria, incordatori e amministratore.
Next.js 14 + Supabase. Nessun accesso per i clienti.

## Messa online

1. Database: esegui una volta `supabase/01_schema_micolani_incorda.sql` nel SQL Editor di Supabase.
2. Carica questi file in un nuovo repository GitHub.
3. Su Vercel importa il repository e aggiungi le variabili d'ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL di Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = chiave anon public
4. Deploy.

## Operatori

- Crea gli account in Supabase > Authentication > Users (con "Auto Confirm User").
- Assegna i ruoli dall'app (menu in alto a destra > Impostazioni e operatori) oppure via SQL:
  `update profili set nome='Nome', ruoli='{segreteria}' where email='...';`
- Ruoli: segreteria, incordatore, admin. Una persona può averne più di uno.

## Regole principali

- Lavorazione, ritiro e pagamento sono tre stati separati.
- Prezzi, pagamenti, ritiri e stati si modificano solo con le operazioni dedicate, controllate dal database.
- Nulla si cancella: storni, rimborsi e correzioni restano nello storico con il motivo.
- Importi in centesimi, date nel fuso orario italiano.
