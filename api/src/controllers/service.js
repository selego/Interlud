const express = require("express");
const passport = require("passport");
const router = express.Router();

const ServiceObject = require("../models/service");
const { capture } = require("../services/sentry");
const ERROR_CODES = require("../utils/errors");

router.get("/:id", async (req, res) => {
  try {
    const data = await ServiceObject.findOne({ _id: req.params.id });
    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post("/search", passport.authenticate(["admin", "api"], { session: false }), async (req, res) => {
  try {
    let query = {};

    const searchValue = req.body.search?.replace(/[#-.]|[[-^]|[?|{}]/g, "\\$&");
    if (req.body.search) {
      query = {
        ...query,
        $or: [{ name: { $regex: searchValue, $options: "i" } }],
      };
    }

    const no_of_docs_each_page = req.body.per_page || 200;
    const current_page_number = req.body.page - 1 || 0;

    const services = await ServiceObject.find(query)
      .skip(no_of_docs_each_page * current_page_number)
      .limit(no_of_docs_each_page);

    const total = await ServiceObject.countDocuments(query);

    return res.status(200).send({ ok: true, data: services, total });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post("/", passport.authenticate(["api"], { session: false }), async (req, res) => {
  try {
    const service = await ServiceObject.create(req.body);

    return res.status(200).send({ data: service, ok: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).send({ ok: false, code: ERROR_CODES.service_ALREADY_REGISTERED });
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "api"], { session: false }), async (req, res) => {
  try {
    const service = await ServiceObject.findById(req.params.id);
    if (!service) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const obj = { ...req.body };

    service.set(obj);
    await service.save();

    res.status(200).send({ ok: true, data: service });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.delete("/:id", passport.authenticate("api", { session: false }), async (req, res) => {
  try {
    await ServiceObject.findOneAndRemove({ _id: req.params.id });
    res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

module.exports = router;
