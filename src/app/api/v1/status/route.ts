import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('system_config')
    .select('value, updated_at, updated_by')
    .eq('key', 'kill_switch')
    .single();

  const frozen = data?.value?.active === true;

  return NextResponse.json({
    status: frozen ? 'frozen' : 'operational',
    kill_switch: {
      active: frozen,
      activated_at: frozen ? data?.updated_at : null,
      activated_by: frozen ? data?.updated_by : null,
    },
    timestamp: new Date().toISOString(),
  });
}
