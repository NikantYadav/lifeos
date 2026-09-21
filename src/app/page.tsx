'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/useAppState';
import { useNow } from '@/lib/useNow';
import { currentWeekIndex, iso } from '@/lib/dates';
import Hero from '@/components/Hero';
import Nav, { panelId, tabId, Tab } from '@/components/Nav';
import SaveIndicator from '@/components/SaveIndicator';
import TodayPanel from '@/components/panels/TodayPanel';
import TimetablePanel from '@/components/panels/TimetablePanel';
import PlansPanel from '@/components/panels/PlansPanel';
import WeekPanel from '@/components/panels/WeekPanel';
import PeoplePanel from '@/components/panels/PeoplePanel';
import RepsPanel from '@/components/panels/RepsPanel';
import BodyPanel from '@/components/panels/BodyPanel';
import PhasesPanel from '@/components/panels/PhasesPanel';

export default function Home() {
  const { state, update, status } = useAppState();
  const [tab, setTab] = useState<Tab>('today');
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  // Jump to a plan from anywhere (e.g. an activity link on the Today panel):
  // switch to the Plans tab with that plan already open.
  const openPlan = (planId: string) => {
    setOpenPlanId(planId);
    setTab('plans');
  };

  // Ticks every minute, so an app left open overnight rolls over to the new
  // day instead of writing to yesterday's key.
  const now = useNow();
  const today = now ?? new Date(0);
  const ready = now !== null;

  const todayKey = iso(today);
  const curWeek = currentWeekIndex(today, state.startDate);
  const dayOfWeek = today.getDay();

  return (
    <div className="wrap">
      <Hero state={state} update={update} today={today} curWeek={curWeek} ready={ready} />
      <Nav active={tab} onChange={setTab} />

      <div id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)} tabIndex={-1}>
        {tab === 'today' && (
          <TodayPanel
            state={state}
            update={update}
            todayKey={todayKey}
            dayOfWeek={dayOfWeek}
            now={now}
            curWeek={curWeek}
            onOpenPlan={openPlan}
          />
        )}
        {tab === 'timetable' && <TimetablePanel schedule={state.schedule} dayOfWeek={dayOfWeek} now={now} />}
        {tab === 'plans' && (
          <PlansPanel plans={state.plans} openPlanId={openPlanId} onOpenPlanIdHandled={() => setOpenPlanId(null)} />
        )}
        {tab === 'week' && <WeekPanel state={state} curWeek={curWeek} todayKey={todayKey} />}
        {tab === 'people' && (
          <PeoplePanel state={state} update={update} todayKey={todayKey} today={today} />
        )}
        {tab === 'reps' && <RepsPanel state={state} update={update} todayKey={todayKey} />}
        {tab === 'body' && (
          <BodyPanel state={state} update={update} todayKey={todayKey} today={today} />
        )}
        {tab === 'phases' && <PhasesPanel curWeek={curWeek} />}
      </div>

      <SaveIndicator status={status} />
    </div>
  );
}
