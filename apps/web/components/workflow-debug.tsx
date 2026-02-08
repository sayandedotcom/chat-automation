"use client";

/**
 * Debug component to visualize workflow state
 * Add this to your chat page temporarily to debug approval issues
 */

import { WorkflowStep } from "./workflow-timeline";

interface WorkflowDebugProps {
  steps: WorkflowStep[];
  currentStep: number;
  workflowStatus: string;
}

export function WorkflowDebug({ steps, currentStep, workflowStatus }: WorkflowDebugProps) {
  const awaitingApprovalSteps = steps.filter(s => s.status === "awaiting_approval");

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs font-mono text-white shadow-xl z-50">
      <div className="font-bold text-sm mb-2">🔍 Workflow Debug</div>

      <div className="space-y-2">
        <div>
          <span className="text-gray-400">Status:</span>{" "}
          <span className="text-green-400">{workflowStatus}</span>
        </div>

        <div>
          <span className="text-gray-400">Current Step:</span>{" "}
          <span className="text-blue-400">{currentStep}</span>
        </div>

        <div>
          <span className="text-gray-400">Total Steps:</span>{" "}
          <span className="text-purple-400">{steps.length}</span>
        </div>

        <div>
          <span className="text-gray-400">Awaiting Approval:</span>{" "}
          <span className="text-amber-400">{awaitingApprovalSteps.length}</span>
        </div>

        {awaitingApprovalSteps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="font-bold text-amber-400 mb-2">Approval Steps:</div>
            {awaitingApprovalSteps.map(step => (
              <div key={step.step_number} className="mb-2 p-2 bg-amber-900/20 border border-amber-500/30 rounded">
                <div>Step #{step.step_number}</div>
                <div className="text-gray-300">{step.description}</div>
                <div className="text-amber-400 text-[10px] mt-1">
                  Status: {step.status}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="font-bold text-gray-300 mb-2">All Steps:</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {steps.map(step => (
              <div
                key={step.step_number}
                className={`text-[10px] p-1 rounded ${
                  step.status === "awaiting_approval"
                    ? "bg-amber-900/30 text-amber-300"
                    : step.status === "in_progress"
                    ? "bg-blue-900/30 text-blue-300"
                    : step.status === "completed"
                    ? "bg-green-900/30 text-green-300"
                    : step.status === "failed"
                    ? "bg-red-900/30 text-red-300"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                #{step.step_number}: {step.status}
                {step.requires_human_approval && " 🛡️"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
