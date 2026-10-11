/**
 * @civolution/automation: player automation that only ever issues engine commands
 * (PLAN.md §8): governors, build templates, the worker pool, unit routines, empire
 * policies, the player's own rules and the turn digest. The AI reuses these modules.
 */
export { runAutomation, runRoutines, type AutomationOptions, type AutomationRun, type RoutineRun } from './run.ts';
export { proposeRoutine, proposeExplore, proposeAutoWorker, proposeAutoSettle, homeTile, type Proposal, type RoutineId, type RoutineContext } from './routines.ts';
export { bestSite, knownLand, siteScore, planBuild, planResearch, planGovernment, planRates, planEmpire, type PlannedBuild, type PlanBuildOptions } from './empire.ts';
export { GOVERNORS, governCity, governorName, samePlacement, type GovernorPlan } from './governors.ts';
export { BUILT_IN_TEMPLATES, allTemplates, buildNeeds, chooseBuild, findTemplate, templateBuild, templateForNewCity, templatePreview, type BuildNeeds, type TemplatePick } from './templates.ts';
export { buildsAutomated, delegateEverything, governorFor, templateFor, templateIdFor } from './assignments.ts';
export { bestOfRole, describeBuild, describeCondition, resolveBuild, unitRole, defenders } from './conditions.ts';
export { forbidden, jobBoard, poolWorkers, workerJobs, type JobAssignment, type JobBoard, type WorkerJob } from './workers.ts';
export { dealAnswer, netIncome, policyHurries, policyRates, policyResearch, policyUpgrades, stepToward } from './policies.ts';
export { exportRoutines, importRoutines, runCustomRules, type RoutineFile } from './custom.ts';
export { inputSeconds, turnDigest, type DigestItem, type DigestKind } from './digest.ts';
