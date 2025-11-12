const express = require("express");
const router = express.Router();
const passport = require("passport");
const Collectivity = require("../models/collectivity");
const Action = require("../models/action");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { calculateStatusEvolutionByMonth, getStartDateForTimeframe } = require("../utils/collectivity");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findById(req.params.id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.search) query.name = { $regex: req.body.search, $options: "i" };

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Collectivity.countDocuments(query);
    const data = await Collectivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const collectivity = await Collectivity.create( req.body );

    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findByIdAndDelete(req.params.id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id/dashboard", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { timeframe = "all" } = req.query; 

    const collectivity = await Collectivity.findById(req.params.id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const actions = await Action.find({ collectivity_id: req.params.id });

    const actionsWithPatches = await Promise.all(
      actions.map(async (action) => {
        try {
          const actionPatches = await action.patches.find({ ref: action._id.toString() }).sort("-date").lean();
          return { action, patches: actionPatches || [] };
        } catch (error) {
          return { action, patches: [] };
        }
      })
    );

    const now = new Date();
    const startDate = getStartDateForTimeframe(timeframe, now);
    const periodStart = startDate || new Date(0); // if all, start from the beginning

    let actionsCreated = 0;
    let actionsUpdated = 0;
    let actionsCompleted = 0;
    let actionsBlocked = 0;

    actionsWithPatches.forEach(({ action, patches }) => {
      const creationDate = patches.length > 0 
        ? new Date(patches[patches.length - 1].date)
        : new Date(action.createdAt);
      
      if (creationDate >= periodStart) {
        actionsCreated++;
      }

      const updatePatches = patches.filter(p => {
        const patchDate = new Date(p.date);
        return patchDate >= periodStart && patchDate > creationDate;
      });

      if (updatePatches.length > 0) {
        actionsUpdated++;
      }

      const completedPatches = patches.filter(p => {
        const patchDate = new Date(p.date);
        if (patchDate < periodStart) return false;
        
        const statusOp = p.ops?.find(op => op.path === "/status" && (op.op === "replace" || op.op === "add"));
        return statusOp && statusOp.value === "completed";
      });

      if (completedPatches.length > 0) {
        actionsCompleted++;
      }

      const blockedPatches = patches.filter(p => {
        const patchDate = new Date(p.date);
        if (patchDate < periodStart) return false;
        
        const statusOp = p.ops?.find(op => op.path === "/status" && (op.op === "replace" || op.op === "add"));
        return statusOp && statusOp.value === "blocked";
      });

      if (blockedPatches.length > 0) {
        actionsBlocked++;
      }
    });

    const repartitionActions = {
      completed: actions.filter(a => a.status === "completed").length,
      toComplete: actions.filter(a => 
        a.status === "in_progress" || (a.completeness > 0 && a.completeness < 100)
      ).length,
      pending: actions.filter(a => 
        a.status === "upcoming" || a.status === "no_status"
      ).length,
      blocked: actions.filter(a => a.status === "blocked").length,
    };

    const evolutionStatutsData = calculateStatusEvolutionByMonth(actionsWithPatches, now, startDate);

    const response = {
      collectivity: collectivity.name,
      summary: {
        actionsCreated,
        actionsUpdated,
        actionsCompleted,
        actionsBlocked,
      },
      distribution: {
        completed: repartitionActions.completed,
        toComplete: repartitionActions.toComplete,
        pending: repartitionActions.pending,
        blocked: repartitionActions.blocked,
      },
      evolution: {
        data: evolutionStatutsData.length > 0 ? evolutionStatutsData : [
          { month: "Jan 2025", completed: 0, pending: 0 }
        ]
      },
      actions,
    };

    return res.status(200).send({ ok: true, data: response });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
