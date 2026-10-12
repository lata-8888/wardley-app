-- =====================================================================
-- Wardley Maps – erster Admin (nach schema.sql im SQL Editor ausführen)
-- Mobilnummer und Name vor dem Ausführen anpassen. Die PIN sind die letzten
-- 6 Ziffern der Mobilnummer (dritter Parameter null). Danach im Admin-Tab der App
-- weitere Personen anlegen und bei Bedarf die PIN zurücksetzen.
-- Diese Datei enthält bewusst keine echten Namen oder Nummern.
-- =====================================================================

select public._create_user('Admin', '079 000 00 00', null, true);

-- Optional: Demo-Personen für DEV (nicht in PRD ausführen)
-- select public._create_user('Anna', '079 111 11 11', null, false);
-- select public._create_user('Ben',  '079 222 22 22', null, false);
