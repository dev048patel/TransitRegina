import { supabase } from '../lib/supabase';
import { DbWeeklySchedule, SaveRow } from '../transit/WeeklySchedule';

export const WeeklyScheduleService = {
    async getForUser(userId: string): Promise<DbWeeklySchedule[]> {
        const { data, error } = await supabase
            .from('weekly_schedules')
            .select('*')
            .eq('user_id', userId)
            .order('day_of_week');
        if (error) throw error;
        return data || [];
    },

    /** Today's trips with reminders on (the trip there and the trip home), earliest departure first */
    async getTodayForUser(userId: string): Promise<DbWeeklySchedule[]> {
        const { data, error } = await supabase
            .from('weekly_schedules')
            .select('*')
            .eq('user_id', userId)
            .eq('day_of_week', new Date().getDay())
            .eq('enabled', true)
            .order('depart_by');
        if (error) throw error;
        return data || [];
    },

    /** One row per day and trip (docs/security/commute_001_trip_home.sql) */
    async saveAll(userId: string, rows: SaveRow[]): Promise<void> {
        if (!rows.length) return;
        const { error } = await supabase
            .from('weekly_schedules')
            .upsert(rows.map(r => ({
                user_id: userId,
                day_of_week: r.day,
                trip: r.trip,
                from_dest_id: r.fromId,
                to_dest_id: r.toId,
                arrive_by: r.arriveBy,
                depart_by: r.departBy,
                route_num: r.routeNum,
                route_list: r.routeList,
                route_total_minutes: r.routeTotalMinutes,
                enabled: r.enabled,
            })), { onConflict: 'user_id,day_of_week,trip' });
        if (error) throw error;
    },
};
