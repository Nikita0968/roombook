-- =============================================================
-- RoomBook — проверочные SQL-запросы
-- Дисциплина: Основы инженерии программных систем
-- Файл подтверждает корректность структуры БД и данных Supabase
-- =============================================================

-- -------------------------------------------------------------
-- 1) WHERE. Выборка с условием
-- Задача: показать все брони, находящиеся на подтверждении
-- -------------------------------------------------------------
select id, booking_date, start_time, end_time, status
from bookings
where status = 'На подтверждении'
order by booking_date;


-- -------------------------------------------------------------
-- 2) ORDER BY. Сортировка
-- Задача: список броней, отсортированный по дате и времени
-- -------------------------------------------------------------
select id, booking_date, start_time, end_time, status
from bookings
order by booking_date desc, start_time asc;


-- -------------------------------------------------------------
-- 3) JOIN. Соединение трёх таблиц
-- Задача: показать брони вместе с названием аудитории и email автора
-- -------------------------------------------------------------
select
  b.id              as booking_id,
  r.name            as room_name,
  r.building        as room_building,
  p.email           as author_email,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.purpose,
  b.status
from bookings b
join rooms r    on r.id = b.room_id
join profiles p on p.id = b.user_id
order by b.created_at desc;


-- -------------------------------------------------------------
-- 4) COUNT. Агрегатный запрос
-- Задача: сколько всего броней в системе
-- -------------------------------------------------------------
select count(*) as total_bookings
from bookings;


-- -------------------------------------------------------------
-- 5) GROUP BY. Группировка с агрегацией
-- Задача: количество броней по каждому статусу
-- -------------------------------------------------------------
select
  status,
  count(*) as count
from bookings
group by status
order by count desc;


-- -------------------------------------------------------------
-- 6) Запрос для показателя административной панели
-- Задача: сколько всего зарегистрированных пользователей
-- -------------------------------------------------------------
select count(*) as total_users
from profiles;


-- =============================================================
-- ДОПОЛНИТЕЛЬНЫЕ ЗАПРОСЫ (для проверки корректности и безопасности)
-- =============================================================

-- -------------------------------------------------------------
-- 7) Показатель админки: количество броней по аудиториям
-- -------------------------------------------------------------
select
  r.name as room_name,
  count(*) as bookings_count
from bookings b
join rooms r on r.id = b.room_id
group by r.name
order by bookings_count desc;


-- -------------------------------------------------------------
-- 8) Показатель админки: количество броней за последние 7 дней
-- -------------------------------------------------------------
select count(*) as bookings_last_week
from bookings
where created_at >= now() - interval '7 days';


-- -------------------------------------------------------------
-- 9) Проверка бизнес-правила: пересекающиеся брони
-- Если результат пуст — правило работает, конфликтов нет
-- -------------------------------------------------------------
select
  a.id as booking_a,
  b.id as booking_b,
  a.room_id,
  a.booking_date,
  a.start_time as a_start,
  a.end_time   as a_end,
  b.start_time as b_start,
  b.end_time   as b_end
from bookings a
join bookings b
  on  a.room_id = b.room_id
  and a.booking_date = b.booking_date
  and a.id < b.id
  and a.status <> 'Отменено'
  and b.status <> 'Отменено'
  and (a.start_time, a.end_time) overlaps (b.start_time, b.end_time);


-- -------------------------------------------------------------
-- 10) История изменений статусов (новая функция)
-- -------------------------------------------------------------
select
  sh.id,
  sh.booking_id,
  r.name as room_name,
  sh.old_status,
  sh.new_status,
  sh.changed_at
from status_history sh
join bookings b on b.id = sh.booking_id
join rooms r    on r.id = b.room_id
order by sh.changed_at desc;


-- -------------------------------------------------------------
-- 11) Проверка RLS: список всех таблиц с включённым RLS
-- -------------------------------------------------------------
select
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;


-- -------------------------------------------------------------
-- 12) Проверка RLS: список всех политик доступа
-- -------------------------------------------------------------
select
  tablename,
  policyname,
  cmd as operation
from pg_policies
where schemaname = 'public'
order by tablename, policyname;