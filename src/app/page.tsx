'use client';

import { useMemo, useState } from 'react';
import { useAppState } from '@/lib/useAppState';
import { currentWeekIndex, iso } from '@/lib/dates';
import Hero from '@/components/Hero';
import Nav, { Tab } from '@/components/Nav';
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
  const { state, update, savedFlash } = useAppState();
  const [tab, setTab] = useState<Tab>('today');

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => iso(today), [today]);
  const curWeek = useMemo(() => currentWeekIndex(today), [today]);
  const dayOfWeek = today.getDay();

  return (
    <div className="wrap">
      <Hero state={state} today={today} curWeek={curWeek} />
      <Nav active={tab} onChange={setTab} />

      {tab === 'today' && (
        <TodayPanel state={state} update={update} todayKey={todayKey} dayOfWeek={dayOfWeek} />
      )}
      {tab === 'timetable' && <TimetablePanel dayOfWeek={dayOfWeek} />}
      {tab === 'plans' && <PlansPanel />}
      {tab === 'week' && <WeekPanel state={state} curWeek={curWeek} todayKey={todayKey} />}
      {tab === 'people' && (
        <PeoplePanel state={state} update={update} todayKey={todayKey} today={today} />
      )}
      {tab === 'reps' && <RepsPanel state={state} update={update} todayKey={todayKey} />}
      {tab === 'body' && <BodyPanel state={state} update={update} today={today} />}
      {tab === 'phases' && <PhasesPanel curWeek={curWeek} />}

      <SaveIndicator up={savedFlash} />
    </div>
  );
}
