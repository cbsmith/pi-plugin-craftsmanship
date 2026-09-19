--------------------------- MODULE ToolExecutionConcurrency ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Tools, ExecutionMode

VARIABLES toolState, lockOwner, lockQueue, activeWriters, activeUIPrompts, completedTools

Vars == <<toolState, lockOwner, lockQueue, activeWriters, activeUIPrompts, completedTools>>

ToolStates == {"IDLE", "QUEUED", "RUNNING", "WRITING_STATE", "PROMPTING_UI", "COMPLETED", "STALLED"}
Modes == {"PARALLEL", "SEQUENTIAL"}

TypeOK ==
  /\ ExecutionMode \in Modes
  /\ toolState \in [Tools -> ToolStates]
  /\ lockOwner \in Tools \cup {"NONE"}
  /\ lockQueue \in Seq(Tools)
  /\ activeWriters \in 0..Cardinality(Tools)
  /\ activeUIPrompts \in 0..Cardinality(Tools)
  /\ completedTools \subseteq Tools

Init ==
  /\ toolState = [t \in Tools |-> "IDLE"]
  /\ lockOwner = "NONE"
  /\ lockQueue = <<>>
  /\ activeWriters = 0
  /\ activeUIPrompts = 0
  /\ completedTools = {}

(---------------------------------------------------------------------------------------)
(* Actions for PARALLEL Execution Mode (Unserialized - Old Buggy Behavior)             *)
(---------------------------------------------------------------------------------------)

DispatchParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "IDLE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, activeUIPrompts, completedTools>>

StartWriteParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "WRITING_STATE"]
  /\ activeWriters' = activeWriters + 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeUIPrompts, completedTools>>

FinishWriteParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "WRITING_STATE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeWriters' = activeWriters - 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeUIPrompts, completedTools>>

PromptUIParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "PROMPTING_UI"]
  /\ activeUIPrompts' = activeUIPrompts + 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, completedTools>>

FinishUIParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "PROMPTING_UI"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeUIPrompts' = activeUIPrompts - 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, completedTools>>

CompleteParallel(t) ==
  /\ ExecutionMode = "PARALLEL"
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "COMPLETED"]
  /\ completedTools' = completedTools \cup {t}
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, activeUIPrompts>>

(---------------------------------------------------------------------------------------)
(* Actions for SEQUENTIAL Execution Mode (Serialized - Fixed Behavior)                  *)
(---------------------------------------------------------------------------------------)

EnqueueSequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ toolState[t] = "IDLE"
  /\ toolState' = [toolState EXCEPT ![t] = "QUEUED"]
  /\ lockQueue' = Append(lockQueue, t)
  /\ UNCHANGED <<lockOwner, activeWriters, activeUIPrompts, completedTools>>

AcquireLockSequential ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = "NONE"
  /\ Len(lockQueue) > 0
  /\ LET nextTool == Head(lockQueue) IN
       /\ lockOwner' = nextTool
       /\ lockQueue' = Tail(lockQueue)
       /\ toolState' = [toolState EXCEPT ![nextTool] = "RUNNING"]
       /\ UNCHANGED <<activeWriters, activeUIPrompts, completedTools>>

StartWriteSequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = t
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "WRITING_STATE"]
  /\ activeWriters' = activeWriters + 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeUIPrompts, completedTools>>

FinishWriteSequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = t
  /\ toolState[t] = "WRITING_STATE"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeWriters' = activeWriters - 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeUIPrompts, completedTools>>

PromptUISequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = t
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "PROMPTING_UI"]
  /\ activeUIPrompts' = activeUIPrompts + 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, completedTools>>

FinishUISequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = t
  /\ toolState[t] = "PROMPTING_UI"
  /\ toolState' = [toolState EXCEPT ![t] = "RUNNING"]
  /\ activeUIPrompts' = activeUIPrompts - 1
  /\ UNCHANGED <<lockOwner, lockQueue, activeWriters, completedTools>>

ReleaseLockAndCompleteSequential(t) ==
  /\ ExecutionMode = "SEQUENTIAL"
  /\ lockOwner = t
  /\ toolState[t] = "RUNNING"
  /\ toolState' = [toolState EXCEPT ![t] = "COMPLETED"]
  /\ lockOwner' = "NONE"
  /\ completedTools' = completedTools \cup {t}
  /\ UNCHANGED <<lockQueue, activeWriters, activeUIPrompts>>

TerminalStutter ==
  /\ completedTools = Tools
  /\ UNCHANGED Vars

Next ==
  \/ (\E t \in Tools : DispatchParallel(t))
  \/ (\E t \in Tools : StartWriteParallel(t))
  \/ (\E t \in Tools : FinishWriteParallel(t))
  \/ (\E t \in Tools : PromptUIParallel(t))
  \/ (\E t \in Tools : FinishUIParallel(t))
  \/ (\E t \in Tools : CompleteParallel(t))
  \/ (\E t \in Tools : EnqueueSequential(t))
  \/ AcquireLockSequential
  \/ (\E t \in Tools : StartWriteSequential(t))
  \/ (\E t \in Tools : FinishWriteSequential(t))
  \/ (\E t \in Tools : PromptUISequential(t))
  \/ (\E t \in Tools : FinishUISequential(t))
  \/ (\E t \in Tools : ReleaseLockAndCompleteSequential(t))
  \/ TerminalStutter

Spec == Init /\ [][Next]_Vars

(---------------------------------------------------------------------------------------)
(* Formal Safety & Liveness Invariants                                                  *)
(---------------------------------------------------------------------------------------)

(* Safety Invariant 1: At most one tool can mutate shared state simultaneously *)
NoConcurrentStateWrites == activeWriters <= 1

(* Safety Invariant 2: At most one interactive UI prompt can be active simultaneously *)
NoConcurrentUIPrompts == activeUIPrompts <= 1

(* Safety Invariant 3: In SEQUENTIAL mode, at most one tool is RUNNING, WRITING, or PROMPTING *)
StrictMutexIsolation ==
  ExecutionMode = "SEQUENTIAL" =>
    Cardinality({t \in Tools : toolState[t] \in {"RUNNING", "WRITING_STATE", "PROMPTING_UI"}}) <= 1

(* Safety Invariant 4: No state mutation while UI prompt is active *)
NoStateWriteDuringUIPrompt ==
  ~(activeWriters > 0 /\ activeUIPrompts > 0)

=============================================================================
