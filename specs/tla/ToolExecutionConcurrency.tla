--------------------------- MODULE ToolExecutionConcurrency ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Tools, ExecutionMode

VARIABLES toolState, fileLockOwner, fileLockQueue, uiPromptOwner, uiQueue, activeWriters, activeUIPrompts, completedTools

Vars == <<toolState, fileLockOwner, fileLockQueue, uiPromptOwner, uiQueue, activeWriters, activeUIPrompts, completedTools>>

ToolStates == {"IDLE", "RUNNING", "WAITING_FILE_LOCK", "WRITING_STATE", "WAITING_UI_LOCK", "PROMPTING_UI", "COMPLETED"}
Modes == {"UNSAFE_PARALLEL", "GLOBAL_SEQUENTIAL", "FINE_GRAINED_PARALLEL"}

TypeOK ==
  /\ ExecutionMode \in Modes
  /\ toolState \in [Tools -> ToolStates]
  /\ fileLockOwner \in Tools \cup {"NONE"}
  /\ fileLockQueue \in Seq(Tools)
  /\ uiPromptOwner \in Tools \cup {"NONE"}
  /\ uiQueue \in Seq(Tools)
  /\ activeWriters \in 0..Cardinality(Tools)
  /\ activeUIPrompts \in 0..Cardinality(Tools)
  /\ completedTools \subseteq Tools

Init ==
  /\ toolState = [t \in Tools |-> "IDLE"]
  /\ fileLockOwner = "NONE"
  /\ fileLockQueue = <<>>
  /\ uiPromptOwner = "NONE"
  /\ uiQueue = <<>>
  /\ activeWriters = 0
  /\ activeUIPrompts = 0
  /\ completedTools = {}

(---------------------------------------------------------------------------------------)
(* FINE_GRAINED_PARALLEL Execution Mode (Internal File Lock + UI Prompt Queueing)     *)
(---------------------------------------------------------------------------------------)

DispatchFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ toolState[t] = "IDLE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ UNCHANGED <<fileLockOwner, fileLockQueue, uiPromptOwner, uiQueue, activeWriters, activeUIPrompts, completedTools>>

RequestFileLockFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "WAITING_FILE_LOCK"]
  /\ fileLockQueue' = Append(fileLockQueue, t)
  /\ UNCHANGED <<fileLockOwner, uiPromptOwner, uiQueue, activeWriters, activeUIPrompts, completedTools>>

AcquireFileLockFineGrained ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ fileLockOwner = "NONE"
  /\ Len(fileLockQueue) > 0
  /\ LET nextTool == Head(fileLockQueue) IN
       /\ fileLockOwner' = nextTool
       /\ fileLockQueue' = Tail(fileLockQueue)
       /\ toolState' = [toolState EXCEPT ![nextTool] = "WRITING_STATE"]
       /\ activeWriters' = activeWriters + 1
       /\ UNCHANGED <<uiPromptOwner, uiQueue, activeUIPrompts, completedTools>>

ReleaseFileLockFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ fileLockOwner = t
  /\ toolState[t] = "WRITING_STATE"
  /\ fileLockOwner' = "NONE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeWriters' = activeWriters - 1
  /\ UNCHANGED <<fileLockQueue, uiPromptOwner, uiQueue, activeUIPrompts, completedTools>>

EnqueueUIPromptFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "WAITING_UI_LOCK"]
  /\ uiQueue' = Append(uiQueue, t)
  /\ UNCHANGED <<fileLockOwner, fileLockQueue, uiPromptOwner, activeWriters, activeUIPrompts, completedTools>>

AcquireUIPromptFineGrained ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ uiPromptOwner = "NONE"
  /\ Len(uiQueue) > 0
  /\ LET nextTool == Head(uiQueue) IN
       /\ uiPromptOwner' = nextTool
       /\ uiQueue' = Tail(uiQueue)
       /\ toolState' = [toolState EXCEPT ![nextTool] = "PROMPTING_UI"]
       /\ activeUIPrompts' = activeUIPrompts + 1
       /\ UNCHANGED <<fileLockOwner, fileLockQueue, activeWriters, completedTools>>

ReleaseUIPromptFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ uiPromptOwner = t
  /\ toolState[t] = "PROMPTING_UI"
  /\ uiPromptOwner' = "NONE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeUIPrompts' = activeUIPrompts - 1
  /\ UNCHANGED <<fileLockOwner, fileLockQueue, uiQueue, activeWriters, completedTools>>

CompleteFineGrained(t) ==
  /\ ExecutionMode = "FINE_GRAINED_PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "COMPLETED"]
  /\ completedTools' = completedTools \cup {t}
  /\ UNCHANGED <<fileLockOwner, fileLockQueue, uiPromptOwner, uiQueue, activeWriters, activeUIPrompts>>

TerminalStutter ==
  /\ completedTools = Tools
  /\ UNCHANGED Vars

Next ==
  \/ (\E t \in Tools : DispatchFineGrained(t))
  \/ (\E t \in Tools : RequestFileLockFineGrained(t))
  \/ AcquireFileLockFineGrained
  \/ (\E t \in Tools : ReleaseFileLockFineGrained(t))
  \/ (\E t \in Tools : EnqueueUIPromptFineGrained(t))
  \/ AcquireUIPromptFineGrained
  \/ (\E t \in Tools : ReleaseUIPromptFineGrained(t))
  \/ (\E t \in Tools : CompleteFineGrained(t))
  \/ TerminalStutter

Spec == Init /\ [][Next]_Vars

(---------------------------------------------------------------------------------------)
(* Formal Safety & Liveness Invariants                                                  *)
(---------------------------------------------------------------------------------------)

(* Safety Invariant 1: At most one tool can mutate shared state simultaneously *)
NoConcurrentStateWrites == activeWriters <= 1

(* Safety Invariant 2: At most one interactive UI prompt can be active simultaneously *)
NoConcurrentUIPrompts == activeUIPrompts <= 1

(* Safety Invariant 3: Multiple tools can run concurrently, but file locks are exclusive *)
ExclusiveFileLock == fileLockOwner /= "NONE" => toolState[fileLockOwner] = "WRITING_STATE"

(* Safety Invariant 4: Multiple tools can run concurrently, but UI prompt modals are exclusive *)
ExclusiveUIPromptModal == uiPromptOwner /= "NONE" => toolState[uiPromptOwner] = "PROMPTING_UI"

=============================================================================
