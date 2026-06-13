SELECT a.staff_id, a.date, a.check_in, a.check_out, a.status AS att_status, b.status AS atts_status, b.check_in_time, b.check_out_time 
FROM attendance a 
LEFT JOIN attendances b ON a.staff_id = b.staff_id AND a.date = b.work_date 
WHERE (a.check_in IS NOT NULL OR a.check_out IS NOT NULL) 
  AND (b.staff_id IS NULL OR (a.check_in IS NOT NULL AND b.check_in_time IS NULL) OR (a.check_out IS NOT NULL AND b.check_out_time IS NULL))
ORDER BY a.date DESC
LIMIT 50;
