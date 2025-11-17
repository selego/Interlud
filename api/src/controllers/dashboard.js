const express = require("express");
const router = express.Router();
const passport = require("passport");
const Collectivity = require("../models/collectivity");
const Action = require("../models/action");
const ActionLog = require("../models/action_log");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { getTimeframeDates } = require("../utils");

router.post("/summary",passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, timeframe = "all" } = req.body;

    const collectivity = await Collectivity.findById(collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const actions = await Action.find({ collectivity_id: collectivity_id });
    const actionIds = actions.map((a) => a._id.toString());

    let periodStart = new Date(0);
    if (timeframe !== "all") {
      const { startDate } = getTimeframeDates(timeframe);
      if (startDate) {
        periodStart = startDate;
      }
    }

    const allLogs = await ActionLog.find({ action_id: { $in: actionIds } })
      .sort("-date")
      .lean();
    
    const logsByAction = {};
    allLogs.forEach((log) => {
      const actionId = log.action_id;
      if (!logsByAction[actionId]) {
        logsByAction[actionId] = [];
      }
      logsByAction[actionId].push(log);
    });

    const actionsWithLogs = actions.map((action) => ({
      action,
      logs: logsByAction[action._id.toString()] || [],
    }));

    let actionsCreated = 0;
    let actionsUpdated = 0;
    let actionsCompleted = 0;
    let actionsBlocked = 0;

    actionsWithLogs.forEach(({ action, logs }) => {
      const creationDate = new Date(action.createdAt);
      if (creationDate >= periodStart) {
        actionsCreated++;
      }

      const updateLogs = logs.filter((log) => {
        const logDate = new Date(log.date);
        return logDate >= periodStart && logDate > creationDate && log.operation === "update";
      });
      if (updateLogs.length > 0) {
        actionsUpdated++;
      }

      const completedLogs = logs.filter((log) => {
        const logDate = new Date(log.date);
        if (logDate < periodStart) return false;
        return log.field === "status" && log.new_value === "completed";
      });
      if (completedLogs.length > 0) {
        actionsCompleted++;
      }

      const blockedLogs = logs.filter((log) => {
        const logDate = new Date(log.date);
        if (logDate < periodStart) return false;
        return log.field === "status" && log.new_value === "blocked";
      });
      if (blockedLogs.length > 0) {
        actionsBlocked++;
      }
    });

    const summary = {
        actionsCreated,
        actionsUpdated,
        actionsCompleted,
        actionsBlocked,
      };

    return res.status(200).send({ ok: true, data: summary });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/evolution", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, timeframe = "all" } = req.body;
    const VALID_TIMEFRAMES = ["week", "month", "year", "all"];
    if (!VALID_TIMEFRAMES.includes(timeframe)) {
      return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_PARAMS });
    }

    const collectivity = await Collectivity.findById(collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    
    const actions = await Action.find({ collectivity_id: collectivity_id });
    const actionIds = actions.map((a) => a._id.toString());

    const now = new Date();
    let startDate = null;
    if (timeframe !== "all") {
      const { startDate: timeframeStartDate } = getTimeframeDates(timeframe);
      if (timeframeStartDate) {
        startDate = timeframeStartDate;
      }
    }

    const allLogs = await ActionLog.find({ action_id: { $in: actionIds } })
      .sort("-date")
      .lean();
      
    const logsByAction = {};
    allLogs.forEach((log) => {
      const actionId = log.action_id;
      if (!logsByAction[actionId]) {
        logsByAction[actionId] = [];
      }
      logsByAction[actionId].push(log);
    });

    const actionsWithLogs = actions.map((action) => ({
      action,
      logs: logsByAction[action._id.toString()] || [],
    }));

    if (actionsWithLogs.length === 0) return res.status(200).send({ ok: true, data: [{ period: "Jan 2025", completed: 0, in_progress: 0, upcoming: 0 }] });

    const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];
    let globalStartPeriod = startDate ? new Date(startDate) : null;
    let globalEndPeriod = new Date(now);

    if (!globalStartPeriod) {
      const creationDates = actionsWithLogs.map(({ action }) => new Date(action.createdAt));
      globalStartPeriod = new Date(Math.min(...creationDates.map((d) => d.getTime())));
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
    }

    if (timeframe === "month") {
      globalStartPeriod.setDate(1);
      globalEndPeriod = new Date(globalEndPeriod.getFullYear(), globalEndPeriod.getMonth() + 1, 0, 23, 59, 59);
    }

    if (timeframe === "year") {
      globalStartPeriod.setMonth(0, 1);
      globalEndPeriod = new Date(globalEndPeriod.getFullYear(), 11, 31, 23, 59, 59);
    }

    if (timeframe === "all") {
      const allLogDates = [];
      actionsWithLogs.forEach(({ logs }) => {
        logs.forEach((log) => {
          allLogDates.push(new Date(log.date));
        });
      });
      
      if (allLogDates.length > 0) {
        globalStartPeriod = new Date(Math.min(...allLogDates.map((d) => d.getTime())));
        globalEndPeriod = new Date(Math.max(...allLogDates.map((d) => d.getTime())));
      } else {
        const creationDates = actionsWithLogs.map(({ action }) => new Date(action.createdAt));
        globalStartPeriod = new Date(Math.min(...creationDates.map((d) => d.getTime())));
        globalEndPeriod = new Date(Math.max(...creationDates.map((d) => d.getTime())));
      }
      globalStartPeriod.setHours(0, 0, 0, 0);
      globalEndPeriod.setHours(23, 59, 59, 999);
    }

    const actionsData = actionsWithLogs.map(({ action, logs }) => {
      const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
      const creationDate = new Date(action.createdAt);
      let initialStatus = action.status;
      if (sortedLogs.length > 0) {
        const firstStatusLog = sortedLogs.find((log) => log.field === "status" && log.operation === "add");
        if (firstStatusLog && firstStatusLog.new_value) {
          initialStatus = firstStatusLog.new_value;
        }
      }
      return {
        actionId: action._id.toString(),
        creationDate,
        sortedLogs,
        initialStatus,
      };
    });
    
    const allPeriods = [];
    for (let currentDate = new Date(globalStartPeriod); currentDate <= globalEndPeriod; ) {
      const periodStart = new Date(currentDate);
      let periodEnd = new Date(currentDate);
      let periodKey = "";
      let timestamp = 0;

      if (timeframe === "week") {
        periodEnd.setDate(currentDate.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
        if (periodEnd > globalEndPeriod) {
          periodEnd.setTime(globalEndPeriod.getTime());
        }
        periodKey = `${String(currentDate.getDate()).padStart(2, "0")}/${String(currentDate.getMonth() + 1).padStart(2, "0")}/${currentDate.getFullYear()}`;
        timestamp = currentDate.getTime();
        allPeriods.push({
          periodKey,
          timestamp,
          periodStart,
          periodEnd,
        });
        currentDate.setDate(currentDate.getDate() + 7);
        if (currentDate > globalEndPeriod) {
          break;
        }
        continue;
      }

      if (timeframe === "month") {
        periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        if (periodEnd > globalEndPeriod) {
          periodEnd.setTime(globalEndPeriod.getTime());
        }
        periodKey = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        timestamp = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
        allPeriods.push({
          periodKey,
          timestamp,
          periodStart,
          periodEnd,
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
        if (currentDate > globalEndPeriod) {
          break;
        }
        continue;
      }

      if (timeframe === "year") {
        periodEnd = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
        if (periodEnd > globalEndPeriod) {
          periodEnd.setTime(globalEndPeriod.getTime());
        }
        periodKey = `${currentDate.getFullYear()}`;
        timestamp = new Date(currentDate.getFullYear(), 0, 1).getTime();
        allPeriods.push({
          periodKey,
          timestamp,
          periodStart,
          periodEnd,
        });
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        if (currentDate > globalEndPeriod) {
          break;
        }
        continue;
      }

      if (timeframe === "all") {
        periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        if (periodEnd > globalEndPeriod) {
          periodEnd.setTime(globalEndPeriod.getTime());
        }
        periodKey = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        timestamp = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
        allPeriods.push({
          periodKey,
          timestamp,
          periodStart,
          periodEnd,
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
        if (currentDate > globalEndPeriod) {
          break;
        }
        continue;
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
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
          const timestamp = weekStart.getTime();
          allPeriods.push({
            periodKey,
            timestamp,
            periodStart,
            periodEnd,
          });
        }
      }
    }

    const periodStatusMap = {};
    allPeriods.forEach(({ periodKey, periodStart, periodEnd }) => {
      actionsData.forEach(({ actionId, creationDate, sortedLogs, initialStatus }) => {
        if (creationDate > periodEnd) return;
        let statusAtPeriodEnd = initialStatus;
        for (const log of sortedLogs) {
          const logDate = new Date(log.date);
          if (logDate > periodEnd) break;
          if (log.field !== "status") continue;
          if (log.operation !== "update" && log.operation !== "add") continue;
          if (!log.new_value) continue;
          statusAtPeriodEnd = log.new_value;
        }
        if (!periodStatusMap[periodKey]) {
          periodStatusMap[periodKey] = {};
        }
        periodStatusMap[periodKey][actionId] = statusAtPeriodEnd;
      });
    });

    const evolutionByPeriod = {};
    Object.entries(periodStatusMap).forEach(([periodKey, statuses]) => {
      const statusCounts = {
        completed: 0,
        in_progress: 0,
        upcoming: 0,
      };
      Object.values(statuses).forEach((status) => {
        if (status === "completed") {
          statusCounts.completed++;
        }
        if (status === "in_progress") {
          statusCounts.in_progress++;
        }
        if (status === "upcoming") {
          statusCounts.upcoming++;
        }
      });
      evolutionByPeriod[periodKey] = statusCounts;
    });

    const evolutionData = allPeriods
      .map(({ periodKey, timestamp }) => {
        const stats = evolutionByPeriod[periodKey] || {
          completed: 0,
          in_progress: 0,
          upcoming: 0,
        };
        return {
          period: periodKey,
          ...stats,
          timestamp,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ timestamp, ...item }) => ({
        period: item.period,
        completed: item.completed,
        in_progress: item.in_progress,
        upcoming: item.upcoming,
      }));

    const evolution = evolutionData.length > 0 ? evolutionData : [{ 
      period: "Jan 2025", 
      completed: 0, 
      in_progress: 0, 
      upcoming: 0,
    }];

    return res.status(200).send({ ok: true, data: evolution });
  } catch (error) {
  capture(error);
  return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
