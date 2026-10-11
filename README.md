# Claude Teacher

**Turn Claude Code into a personal tutor for anything you want to learn.**

You name a topic, and the teacher works out where you're starting from. It
teaches one small step at a time, checks that you actually understood before
moving on, and saves your progress so the next session picks up where you
stopped. You can also ask it for a quiz, a hands-on exercise, or homework.

Behind the scenes, a second agent called the **scout** searches the web for
learning materials. The scout never talks to you. It reports privately to the
teacher, which decides what's worth your time. So you get the one
visualization that makes something click, at the moment you need it, instead
of a list of twenty links.

```
/teacher:teach C programming
```

Free and MIT-licensed. There are no API keys, no accounts, and nothing to
connect.

---

## Contents

- [Quick start](#quick-start)
- [What a lesson looks like](#what-a-lesson-looks-like)
- [Commands](#commands)
  - [Lesson](#lesson-teach-topic)
  - [Quiz](#quiz-teach-quiz)
  - [Hands-on exercise](#hands-on-exercise-teach-exercise)
  - [Homework](#homework-teach-homework)
  - [Quit](#quit-teach-quit)
- [Teaching-mode band](#teaching-mode-band)
- [How it works](#how-it-works)
- [Files it keeps](#files-it-keeps)
- [Safety](#safety)
- [Install options](#install-options)
- [FAQ](#faq)
- [Customizing](#customizing)
- [Uninstall](#uninstall)

---

## Quick start

**1. Install** (in Claude Code):

```
/plugin install teacher --marketplace mustafa-hidiroglu/claude-teacher-skill
```

**2. Restart Claude Code** so the scout agent and the teaching-mode band load.

**3. Allow web access for the scout.** It runs in the background and can't
stop to ask, so allow `WebSearch` and `WebFetch` in `/permissions`. Without
them the teacher still teaches, just without outside materials.

**4. Start learning:**

```
/teacher:teach recursion
```

> Installed as a plugin, the command is `/teacher:teach`. If you copied the
> skill folder by hand instead (see [Install options](#install-options)), it's
> `/teach`. The examples below use the short form `/teach`.

---

## What a lesson looks like

This is condensed from a real session. The learner knows some Python and
wants C for embedded work.

```
> /teach C programming

  Teacher: What do you want C for?
    ( ) Systems / embedded   ( ) Understand computers   ( ) Course or exam   ( ) Job
  Teacher: Where are you starting from?
    ( ) Know another language   ( ) Some C already   ( ) Brand new

  [Systems / embedded]  [Know another language]

Teacher: To a computer, everything is a number, including letters. 'A' is 65,
'B' is 66. A char in C is just a 1-byte box holding a small number, and
printf decides how to show it:

    char c = 'A';
    printf("%c\n", c);   // as a character → A
    printf("%d\n", c);   // as a number    → 65

Check: what does this print?

    char c = 'B';
    printf("%d\n", c);

> is it 66?

Teacher: Yes, 66. A value is just bytes, and you choose how to read them.

Lesson 2: boxes have a fixed size. An unsigned char holds only 0 to 255.
Think of a car odometer with 3 digits.

Check: unsigned char x = 255; x = x + 1; what's x?

> 0

Teacher: Correct. It rolled over, like 999 → 000. In embedded code timers do
this on purpose all the time…

> wait, is it the same if the char was signed?

Teacher: Good question, and the answer is "not quite". A signed char goes from
-128 to 127… (it answers the tangent, then returns to the lesson)
```

A few things to notice:

- **It diagnoses first.** It asks at most two quick questions, then adapts:
  when the learner said "my Python is okay, not great", it slowed down.
- **Every step ends with a check question** that needs understanding, such as
  predicting the output or explaining why, not just recalling a fact.
- **Wrong or partial answers get a different explanation,** not the same one
  repeated.
- **Tangents are welcome.** It answers them, then steers back.
- **No link dump.** A resource appears only when it beats the explanation,
  with one line on what to look for.

---

## Commands

| Command | What it does |
| --- | --- |
| `/teach <topic>` | Start a lesson, or resume one |
| `/teach quiz [topic]` | A graded quiz on what you've covered |
| `/teach exercise [topic]` | A hands-on task to do right now (`hands-on` works too) |
| `/teach homework [topic]` | A take-home assignment saved to a file |
| `/teach homework check [N]` | Grade your homework |
| `/teach quit` | Save progress and leave teaching mode |

The topic is optional everywhere except the first lesson. Without one, the
teacher uses the current lesson or your most recent topic. All of these also
work in plain words mid-lesson: "quiz me", "give me homework", "let's do an
exercise", "quit".

If your topic starts with one of the command words, put `learn` in front:
`/teach learn exercise physiology`.

### Lesson: `/teach <topic>`

```
/teach recursion
/teach how transformers work, I already know basic linear algebra
/teach Bayesian statistics, I have an exam next week
```

Each step follows the same loop:

| Step | What happens |
| --- | --- |
| **Explain** | One small idea in plain language, with a concrete example or analogy |
| **Show** | Optionally, one vetted resource (a visualizer, a worked example, an exercise set), shown as the full URL plus what to look for |
| **Check** | One question: predict, apply, explain back, or spot the bug |
| **Adapt** | Right: move on. Wrong: find the exact misconception and try a different angle. Stuck twice: ask the scout for something targeted, like a visual for that one idea. |

While learning you can say `slower`, `harder`, `skip`, or `give me
resources`. Run the same command later and it resumes:

```
> /teach C programming

Teacher: Welcome back. Last time you got that a char is just a number, and we
were on fixed-size boxes. One question was still waiting for you…
```

### Quiz: `/teach quiz`

Five questions on what you've covered, asked one at a time (example below). It leans toward
things you got wrong before and things that haven't been tested in a while.
Feedback comes at the end, so earlier answers don't give later ones away.

```
> /teach quiz

Teacher: Question 1 of 5. What does this print?

    unsigned char x = 0;
    x = x - 1;
    printf("%d\n", x);

> 255

Teacher: Question 2 of 5…

  …

Teacher: Score: 4/5.
  ✗ Q3: printf("%c", 66) prints B, not 66. %c shows the number as a character.
Marked "%c vs %d" as shaky and moved it to the top of your next session.
Want an exercise on it?
```

Missed topics are marked `shaky` and come back first next time. A shaky topic
you then answer correctly is marked `solid` again. Every quiz score is saved.

### Hands-on exercise: `/teach exercise`

A 5–15 minute task done right now, with a visible result. For code topics, the
teacher asks once for a **lab folder** (e.g. `~/c-lab`). It then creates a
starter file there, with `TODO`s where you write code and a note on what
correct output looks like:

```c
// ~/c-lab/ex1_overflow.c
// Goal: watch an unsigned byte roll over.
// Correct output ends with: 254 255 0 1
#include <stdio.h>

int main(void) {
    unsigned char x = 250;
    // TODO: loop 8 times. Each time, print x followed by a space, then add 1.

    printf("\n");
    return 0;
}
```

```
Teacher: Build and run it with:
  ! cd ~/c-lab && cc -Wall ex1_overflow.c -o ex1 && ./ex1
Tell me when you're done, or if you get stuck.
```

If you're stuck it gives one hint at a time, smallest first, and never the
answer before you've tried. When you're done, it reads and runs your file,
tells you what's right, and names the single most important thing to improve.
It only creates new files in the lab folder and never overwrites one.

For non-code topics, the exercise is a worked problem, a small calculation, a
sketch to describe, or a mini experiment.

### Homework: `/teach homework`

A take-home assignment of 3–5 tasks that get harder as they go. The last one
is a stretch task that combines two ideas. It's saved to a file with space for
your answers and **no solutions**:

```markdown
# Homework 1 — C programming: chars, sizes, overflow
Estimated time: 30 min

## Task 1 — Predict, then check
Without running it, write what this prints, then run it to check:
    char c = 'a';
    printf("%d %c\n", c, c + 1);
### Answer

## Task 2 — Code: hw1_task2.c
Print the size in bytes of char, int and double using sizeof.
Build and run: cc -Wall hw1_task2.c -o hw1_task2 && ./hw1_task2
### Answer

…
```

When you're done, run `/teach homework check`. The teacher grades each task as
correct, partly correct, or missing, and gives a specific hint rather than the
full solution. It shows a model solution only after you've tried a task, or if
you ask. Before running any of your code it tells you the exact command and
waits for your yes. It builds that command itself, from your `hw<N>_*` files
only.

### Quit: `/teach quit`

This saves your progress, including any question you hadn't answered yet, so
the next session starts there. It also stops the scout, gives a short recap,
and drops the teacher role. Saying "quit teaching mode" mid-lesson does the
same.

```
Teacher: You're out of teaching mode.
  Solid:       chars are numbers; unsigned overflow wraps (255 + 1 → 0)
  Introduced:  signed vs unsigned; variables live at addresses (&x)
  Next time:   the address question, then a hands-on with &x and %p
Resume anytime with /teach C programming.
```

---

## Teaching-mode band

While teaching mode is on, a band above the prompt makes it obvious:

```
 🎓 TEACHING MODE  C programming · quiz · /teach quit to leave
```

The left label is white on magenta, the topic is in magenta, and the current
activity (lesson, quiz, exercise, homework, homework check) is dimmed. The
status line also shows `🎓 Teaching · C programming`. Both turn on with
`/teach` and off when you quit, whether you use `/teach quit` or just say
"quit".

The band is a Claude Code UI hook (`hooks/register.tsx`), so it comes with the
**plugin install**. A hand-copied skill works the same, just without the band.

---

## How it works

```mermaid
flowchart LR
    U(["You"]) <-->|main chat| T["Teacher<br/>(teach skill)"]
    T <-.->|"private side channel<br/>briefs ⇄ reports"| S["Scout<br/>(subagent)"]
    S -->|WebSearch / WebFetch| W[("The web")]
    T -->|one-line log| C["channel.md"]
    T -->|saves| P["progress.md"]
```

1. **You start a lesson.** The teacher immediately sends the scout a
   **brief**: the topic, your level, and what it needs ("first sweep: best
   explanation, one visual, one exercise source, one reference").
2. **The scout searches in the background** while the teacher asks its
   diagnostic questions, so there's no waiting.
3. **The scout returns a report to the teacher, never to you.** Each resource
   has its level, format, estimated time, whether the scout actually opened it,
   a quality score and caveats. The report also lists the gaps it couldn't fill
   and warnings, such as spammy sites it chose not to open, or two sources that
   contradict each other.
4. **The teacher curates.** It uses the report's insights in its own
   explanations and holds the resources in reserve, releasing one only when it
   beats explaining.
5. **When you get stuck,** the teacher sends the scout a targeted follow-up
   brief, and the two keep a running conversation out of your way.

### Why a private side channel?

If a research agent posted straight into your chat, you'd get noise: every
link it found, half of them at the wrong level. In Claude Code, a subagent's
result goes back to the agent that launched it. It isn't posted into the
conversation, and at most it appears as collapsed tool output. The teacher
reaches the scout by its agent ID. The scout is deliberately unnamed, because
a named agent becomes a teammate whose messages show up in your chat. If
you're curious, `channel.md` keeps a one-line-per-message log of the exchange.

---

## Files it keeps

Everything is local, in `~/.claude/teacher/<topic>/`:

| File | Contents |
| --- | --- |
| `progress.md` | Your goal, level and preferences; what's solid or shaky; what's next; resources shown; quiz scores; homework status; your lab folder |
| `homework/hw-N.md` | Each homework assignment, with space for your answers |
| `channel.md` | One line per side-channel message: each brief sent, and a summary of each report |

An example `progress.md` after two short sessions:

```markdown
# C programming
- goal: systems / embedded
- level: beginner in C; Python working-level
- prefers: interactive, hands-on
- lab: /Users/you/c-lab

## Covered
- char is a number (ASCII), %c vs %d: solid
- fixed-size types, unsigned overflow wraps (255+1 → 0): solid
- addresses and &, %p: introduced

## Next
- pointers
- arrays and strings

## Quizzes
- 2026-10-12: 4/5, missed: %c vs %d
```

Delete a topic folder to start that topic fresh, or delete
`~/.claude/teacher/` to clear everything.

---

## Safety

The scout reads arbitrary web pages, so the design assumes some of them are
hostile.

- **The scout is read-only.** Its only tools are `WebSearch` and `WebFetch`.
  It can't write files or run commands. If the scout isn't available, the
  teacher does **not** fall back to a general-purpose agent (which would have
  file and shell access). It teaches without web materials instead.
- **Web pages are data, not instructions.** The scout ignores text on pages
  aimed at AI agents and flags it under `WARNINGS`. Scout reports never
  trigger actions by the teacher, and the teacher never relays install
  commands, package names or shell snippets from them.
- **Links are vetted.** You only see resources the scout actually opened,
  served over https and printed as the full URL, never hidden behind link
  text. URL shorteners, raw IP addresses, lookalike domains, direct downloads,
  and pages that need a login or payment are skipped.
- **Files stay contained.** Topic names are sanitized before they become
  folder names. The lab folder must be under your home directory and outside
  dot-directories, and existing files are never overwritten.
- **Your code runs only with your yes.** Homework checking builds the run
  command itself and asks first.

---

## Install options

**Plugin (recommended, includes the band)**

```
/plugin install teacher --marketplace mustafa-hidiroglu/claude-teacher-skill
```

On Claude Code older than 2.1.275:

```
/plugin marketplace add mustafa-hidiroglu/claude-teacher-skill
/plugin install teacher@claude-teacher-skill
```

The command is `/teacher:teach`, and the scout is `teacher:scout`.

**Ask Claude to install it.** Paste into Claude Code:

```
https://github.com/mustafa-hidiroglu/claude-teacher-skill

Install this as a plugin.
```

**Manual copy (no band)**

```bash
git clone https://github.com/mustafa-hidiroglu/claude-teacher-skill.git
mkdir -p ~/.claude/skills ~/.claude/agents
cp -r claude-teacher-skill/skills/teach ~/.claude/skills/
cp claude-teacher-skill/agents/scout.md ~/.claude/agents/
```

The command is `/teach`. For a single project, copy into that repo's
`.claude/skills/` and `.claude/agents/` instead.

**After any install, restart Claude Code.**

### Requirements

- [Claude Code](https://claude.com/claude-code)
- `WebSearch` and `WebFetch` allowed (see [Quick start](#quick-start), step 3)
- For coding topics: whatever compiler or runtime the topic needs. On macOS,
  C needs the Xcode command-line tools with the license accepted
  (`sudo xcodebuild -license`).

---

## FAQ

**Does it work for non-programming topics?**
Yes: history, statistics, music theory, a language, anything. Exercises then
become worked problems, calculations or small experiments instead of code
files.

**Can I learn several topics at once?**
Yes. Each topic has its own folder and progress. `/teach <topic>` switches,
and a command without a topic uses the one you used most recently.

**Where do the links come from?**
From the scout's web searches, after the teacher vets them. Ask "where do
these links come from?" mid-lesson, or look at `channel.md`.

**The scout found nothing, or every link says unverified.**
`WebFetch` is probably blocked. Allow it in `/permissions`. The teacher tells
you once when this happens and keeps teaching from its own knowledge.

**Will it just give me the answers?**
No. Check questions wait for your answer, exercises give hints one at a time,
and homework never includes solutions. You can always ask for an answer, and
it'll give it.

**Does it cost extra?**
There's no separate fee. The teacher and the scout both use your normal
Claude Code usage, like any other agent. The scout runs on Sonnet to keep web
research cheap.

---

## Customizing

| What | Where |
| --- | --- |
| Scout model | `model: sonnet` in `agents/scout.md`. Use `haiku` for cheaper sweeps, `opus` for hard topics. |
| Teaching style | §5 of `skills/teach/SKILL.md`, e.g. more check questions, or more exercises |
| Quiz length and mix | §8 of `skills/teach/SKILL.md` |
| Homework size | §9 of `skills/teach/SKILL.md` |
| Scout report format | `agents/scout.md`. If you add fields, update §4 of the skill. |
| Band look | `hooks/register.tsx` (colors, text), with tests in `hooks/register.test.tsx` |

## Uninstall

Plugin:

```
/plugin uninstall teacher
```

Manual copy:

```bash
rm -rf ~/.claude/skills/teach ~/.claude/agents/scout.md
```

Your learning progress (optional): `rm -rf ~/.claude/teacher`

## License

MIT, see [LICENSE](LICENSE).
