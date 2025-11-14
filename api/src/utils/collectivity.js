function getStartDateForTimeframe(timeframe, now) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const timeframes = {
    week: () => {
      const date = new Date(startOfToday);
      date.setDate(date.getDate() - 7);
      return date;
    },
    month: () => {
      const date = new Date(startOfToday);
      date.setMonth(date.getMonth() - 1);
      return date;
    },
    year: () => {
      const date = new Date(startOfToday);
      date.setFullYear(date.getFullYear() - 1);
      return date;
    },
  };

  const getStartDate = timeframes[timeframe];
  if (!getStartDate || timeframe === "all") return null;

  return getStartDate();
}

function calculateStatusEvolution(actionsWithPatches, now, startDate = null, timeframe = "all") {
  if (actionsWithPatches.length === 0) {
    return [];
  }

  const evolutionByPeriod = {};
  const periodStatusMap = {};
  const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];

  let globalStartPeriod = startDate ? new Date(startDate) : null;
  let globalEndPeriod = new Date(now);

  if (!globalStartPeriod) {
    globalStartPeriod = new Date(
      Math.min(
        ...actionsWithPatches.map(({ action, patches }) => {
          const creationDate = patches.length > 0 ? new Date(patches[patches.length - 1].date) : new Date(action.createdAt);
          return creationDate.getTime();
        })
      )
    );
  }

  if (!globalStartPeriod) {
    globalStartPeriod = new Date(now);
  }

  globalStartPeriod.setHours(0, 0, 0, 0);
  globalEndPeriod.setHours(23, 59, 59, 999);

  if (timeframe === "week") {
    const dayOfWeek = globalStartPeriod.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    globalStartPeriod.setDate(globalStartPeriod.getDate() - daysToMonday);
    
    const endDayOfWeek = globalEndPeriod.getDay();
    const daysToSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
    globalEndPeriod.setDate(globalEndPeriod.getDate() + daysToSunday);
    globalEndPeriod.setHours(23, 59, 59, 999);
  } else if (timeframe === "month") {
    globalStartPeriod.setDate(1);
    
    globalEndPeriod = new Date(globalEndPeriod.getFullYear(), globalEndPeriod.getMonth() + 1, 0, 23, 59, 59);
  } else if (timeframe === "year") {
    globalStartPeriod.setMonth(0, 1);
    
    globalEndPeriod = new Date(globalEndPeriod.getFullYear(), 11, 31, 23, 59, 59);
  } else {
    globalStartPeriod.setDate(1);
    globalEndPeriod = new Date(globalEndPeriod.getFullYear(), globalEndPeriod.getMonth() + 1, 0, 23, 59, 59);
  }

  const actionsData = actionsWithPatches.map(({ action, patches }) => {
    const creationDate = patches.length > 0 ? new Date(patches[patches.length - 1].date) : new Date(action.createdAt);
    const sortedPatches = [...patches].sort((a, b) => new Date(a.date) - new Date(b.date));

    let initialStatus = action.status;
    if (sortedPatches.length === 0) {
      return {
        actionId: action._id.toString(),
        creationDate,
        sortedPatches,
        initialStatus,
      };
    }

    const firstPatch = sortedPatches[0];
    if (firstPatch.path === "status" && firstPatch.op === "add" && firstPatch.value) {
      initialStatus = firstPatch.value;
    }

    return {
      actionId: action._id.toString(),
      creationDate,
      sortedPatches,
      initialStatus,
    };
  });

  const allPeriods = [];

  for (let d = new Date(globalStartPeriod); d <= globalEndPeriod; ) {
    const periodStart = new Date(d);
    let periodEnd = new Date(d);
    let periodKey = "";
    let sortKey = 0;

    if (timeframe === "week") {
      periodEnd.setDate(d.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
      
      if (periodEnd > globalEndPeriod) {
        periodEnd.setTime(globalEndPeriod.getTime());
      }
      
      periodKey = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      sortKey = d.getTime();
      
      allPeriods.push({
        periodKey,
        sortKey,
        periodStart,
        periodEnd,
      });
      
      d.setDate(d.getDate() + 7);
      
      if (d > globalEndPeriod) {
        break;
      }
    } else if (timeframe === "month") {
      periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      periodKey = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      allPeriods.push({
        periodKey,
        sortKey,
        periodStart,
        periodEnd,
      });
      d.setMonth(d.getMonth() + 1);
    } else if (timeframe === "year") {
      periodEnd = new Date(d.getFullYear(), 11, 31, 23, 59, 59);
      periodKey = `${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), 0, 1).getTime();
      allPeriods.push({
        periodKey,
        sortKey,
        periodStart,
        periodEnd,
      });
      d.setFullYear(d.getFullYear() + 1);
    } else {
      periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      periodKey = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      allPeriods.push({
        periodKey,
        sortKey,
        periodStart,
        periodEnd,
      });
      d.setMonth(d.getMonth() + 1);
    }
  }

  if (timeframe === "week" && allPeriods.length > 0) {
    const lastPeriod = allPeriods[allPeriods.length - 1];
    if (lastPeriod.periodEnd < globalEndPeriod) {
      const endDate = new Date(globalEndPeriod);
      const dayOfWeek = endDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(endDate);
      weekStart.setDate(endDate.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      
      if (weekStart.getTime() !== lastPeriod.periodStart.getTime()) {
        const periodStart = new Date(weekStart);
        const periodEnd = new Date(globalEndPeriod);
        const periodKey = `${String(weekStart.getDate()).padStart(2, "0")}/${String(weekStart.getMonth() + 1).padStart(2, "0")}/${weekStart.getFullYear()}`;
        const sortKey = weekStart.getTime();
        
        allPeriods.push({
          periodKey,
          sortKey,
          periodStart,
          periodEnd,
        });
      }
    }
  }

  allPeriods.forEach(({ periodKey, periodStart, periodEnd }) => {
    actionsData.forEach(({ actionId, creationDate, sortedPatches, initialStatus }) => {
      if (creationDate > periodEnd) return;

      let statusAtPeriodEnd = initialStatus;

      for (const patch of sortedPatches) {
        const patchDate = new Date(patch.date);
        if (patchDate > periodEnd) break;
        
        if (patch.path !== "status") continue;
        if (patch.op !== "replace" && patch.op !== "add") continue;
        if (!patch.value) continue;
        
        statusAtPeriodEnd = patch.value;
      }

      if (!periodStatusMap[periodKey]) {
        periodStatusMap[periodKey] = {};
      }
      periodStatusMap[periodKey][actionId] = statusAtPeriodEnd;
    });
  });

  Object.entries(periodStatusMap).forEach(([periodKey, statuses]) => {
    evolutionByPeriod[periodKey] = {
      completed: Object.values(statuses).filter((s) => s === "completed").length,
      in_progress: Object.values(statuses).filter((s) => s === "in_progress").length,
      pending: Object.values(statuses).filter((s) => s === "upcoming" || s === "no_status").length,
      blocked: Object.values(statuses).filter((s) => s === "blocked").length,
    };
  });

  const evolutionData = allPeriods
    .map(({ periodKey, sortKey }) => {
      const stats = evolutionByPeriod[periodKey] || { completed: 0, in_progress: 0, pending: 0, blocked: 0 };
      return {
        month: periodKey,
        ...stats,
        sortKey,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey, ...item }) => ({
      month: item.month,
      completed: item.completed,
      in_progress: item.in_progress,
      pending: item.pending,
    }));

  return evolutionData;
}

module.exports = { calculateStatusEvolution, getStartDateForTimeframe };