const express = require("express");
const router = express.Router();
const passport = require("passport");
const Collectivity = require("../models/collectivity");
const Action = require("../models/action");
const ActionPatch = require("../models/action_patch");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { calculateStatusEvolution, getStartDateForTimeframe } = require("../utils/collectivity");

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

router.post("/dashboard",passport.authenticate(["admin", "user"], { session: false, failWithError: true }),async (req, res) => {
    try {
      const { collectivity_id, timeframe = "all" } = req.body;

      const collectivity = await Collectivity.findById(collectivity_id);
      if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

      const actions = await Action.find({ collectivity_id: collectivity_id });
      
      const actionIds = actions.map(a => a._id);
      
      const now = new Date();
      const startDate = getStartDateForTimeframe(timeframe, now);
      const periodStart = startDate || new Date(0);
      
      const allPatches = await ActionPatch.find({ ref: { $in: actionIds } }).sort("-date").lean();
      
      const patchesByAction = {};
      allPatches.forEach(patch => {
        const actionId = patch.ref.toString();
        if (!patchesByAction[actionId]) {
          patchesByAction[actionId] = [];
        }
        patchesByAction[actionId].push(patch);
      });

      const actionsWithPatches = actions.map(action => ({
        action,
        patches: patchesByAction[action._id.toString()] || []
      }));

      let actionsCreated = 0;
      let actionsUpdated = 0;
      let actionsCompleted = 0;
      let actionsBlocked = 0;

      actionsWithPatches.forEach(({ action, patches }) => {
        const creationDate = new Date(action.createdAt);
        
        const sortedPatches = [...patches].sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstPatch = sortedPatches[0];
        if (firstPatch) {
          const firstPatchDate = new Date(firstPatch.date);
          if (firstPatchDate < creationDate || Math.abs(firstPatchDate - creationDate) < 1000) {
            creationDate.setTime(firstPatchDate.getTime());
          }
        }

        if (creationDate >= periodStart) {
          actionsCreated++;
        }

        const updatePatches = patches.filter((p) => {
          const patchDate = new Date(p.date);
          return patchDate >= periodStart && patchDate > creationDate;
        });

        if (updatePatches.length > 0) {
          actionsUpdated++;
        }

        const completedPatches = patches.filter((p) => {
          const patchDate = new Date(p.date);
          if (patchDate < periodStart) return false;
          return p.path === "status" && (p.op === "replace" || p.op === "add") && p.value === "completed";
        });

        if (completedPatches.length > 0) {
          actionsCompleted++;
        }

        const blockedPatches = patches.filter((p) => {
          const patchDate = new Date(p.date);
          if (patchDate < periodStart) return false;
          return p.path === "status" && (p.op === "replace" || p.op === "add") && p.value === "blocked";
        });

        if (blockedPatches.length > 0) {
          actionsBlocked++;
        }
      });

      // Calculer la répartition : trier les actions selon leur status
      const repartitionActions = {
        completed: actions.filter((a) => a.status === "completed").length,
        in_progress: actions.filter((a) => a.status === "in_progress").length,
        upcoming: actions.filter((a) => a.status === "upcoming").length,
        blocked: actions.filter((a) => a.status === "blocked").length,
        no_status: actions.filter((a) => a.status === "no_status").length,
      };

      const evolutionStatutsData = calculateStatusEvolution(actionsWithPatches, now, startDate, timeframe);

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
          toComplete: repartitionActions.in_progress,
          pending: repartitionActions.upcoming + repartitionActions.no_status,
          blocked: repartitionActions.blocked,
        },
        evolution: {
          data:
            evolutionStatutsData.length > 0 ? evolutionStatutsData : [{ month: "Jan 2025", completed: 0, in_progress: 0, pending: 0 }],
        },
        actions,
      };

      return res.status(200).send({ ok: true, data: response });
    } catch (error) {
      capture(error);
      return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
    }
  },
);

module.exports = router;
