function getStartDateForTimeframe(timeframe, now) {
  const startDate = new Date(now);
  
  switch (timeframe) {
    case "day":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "week": {
      const dayOfWeek = startDate.getDay();
      const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Lundi
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "year":
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "all":
    default:
      return null; // Pas de limite de date
  }
  
  return startDate;
}

function calculateStatusEvolutionByMonth(actionsWithPatches, now, startDate = null) {
  const evolutionByMonth = {};
  const monthStatusMap = {};
  
  actionsWithPatches.forEach(({ action, patches }) => {
    const creationDate = patches.length > 0 
      ? new Date(patches[patches.length - 1].date)
      : new Date(action.createdAt);
    
    const sortedPatches = [...patches].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let initialStatus = action.status;
    if (sortedPatches.length > 0) {
      const firstPatch = sortedPatches[0];
      const statusOp = firstPatch.ops?.find(op => op.path === "/status" && op.op === "add");
      if (statusOp && statusOp.value) {
        initialStatus = statusOp.value;
      }
    }
    
    const startMonth = startDate 
      ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      : new Date(creationDate.getFullYear(), creationDate.getMonth(), 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let d = new Date(startMonth); d <= currentMonth; d.setMonth(d.getMonth() + 1)) {
      const monthKey = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      
      let statusAtMonthEnd = initialStatus;
      
      for (const patch of sortedPatches) {
        const patchDate = new Date(patch.date);
        if (patchDate <= monthEnd) {
          const statusOp = patch.ops?.find(op => op.path === "/status" && (op.op === "replace" || op.op === "add"));
          if (statusOp && statusOp.value) {
            statusAtMonthEnd = statusOp.value;
          }
        } else {
          break;
        }
      }
      
      if (creationDate > monthEnd) continue;
      
      if (!monthStatusMap[monthKey]) {
        monthStatusMap[monthKey] = {};
      }
      monthStatusMap[monthKey][action._id.toString()] = statusAtMonthEnd;
    }
  });
  
  Object.entries(monthStatusMap).forEach(([monthKey, statuses]) => {
    evolutionByMonth[monthKey] = {
      completed: Object.values(statuses).filter(s => s === "completed").length,
      pending: Object.values(statuses).filter(s => s === "upcoming" || s === "no_status").length,
      blocked: Object.values(statuses).filter(s => s === "blocked").length
    };
  });

  const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
  const evolutionData = Object.entries(evolutionByMonth)
    .map(([month, stats]) => {
      const parts = month.split(' ');
      const monthName = parts[0];
      const year = parseInt(parts[1]);
      const monthIndex = monthNames.indexOf(monthName);
      const monthNum = monthIndex >= 0 ? monthIndex : 0;
      
      return {
        month,
        ...stats,
        sortKey: new Date(year, monthNum, 1).getTime()
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey, ...item }) => ({
      month: item.month,
      completed: item.completed,
      pending: item.pending,
    }));

  return evolutionData;
}

module.exports = { calculateStatusEvolutionByMonth, getStartDateForTimeframe };

