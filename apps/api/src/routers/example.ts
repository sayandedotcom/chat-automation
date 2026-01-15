import { Router } from "express";

export const exampleRouter: Router = Router({ mergeParams: true });

exampleRouter.get("/", (req, res) => {
  res.json({ message: "example" });
});
