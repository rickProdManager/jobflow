# Job Flow User Guide

Job Flow is a local application for recording job applications, the events that happen during each process, and the actions you need to take next.

Use it in this order: create an application, record real activity as it happens, keep follow-ups in Next Actions, and review the pipeline in Analytics.

This guide describes the visible app controls. It assumes you have already unlocked Job Flow and are looking at the Dashboard.

## 1. Add an application

Select **+ Application**. Enter the company and role, then add any details that are useful to you:

- location, work mode, salary range, and job link
- how the application started: direct, referral, or headhunter outreach
- the resume, cover letter, portfolio, and tailoring notes used for that role

You only create the application once. Everything that happens afterward belongs in its activity timeline.

### Important: when to create the application

The first time you save an application, Job Flow creates an **Application submitted** activity dated that day. For the clearest data, create the application when you actually apply. If you are entering an older application, open its Details afterward and edit the generated submission activity to the actual submission date.

### What the application fields are for

| Field | When it is useful |
| --- | --- |
| Company and role | Required. These are used in search, the applications list, and the Flow map. |
| Application path | Choose Direct, Referral, or Headhunter. Referral and Headhunter reveal the relevant contact fields. |
| Stage | A quick current-status label. Recorded outcome activities take precedence for Offer, Accepted, Rejected, and Abandoned. |
| Salary minimum / maximum | Structured salary data used by the salary analytics. Enter numbers only; the app formats them as currency. |
| Job URL | A link back to the original job post. |
| Documents used | The resume, cover letter, portfolio, and tailoring notes associated with this specific application. |

## 2. Record activity as it happens

From the application card, select **Activity** and choose the event that happened. Add the date and optional details that will help you remember the context later.

Use these activities for their real-world meaning:

- **Application submitted** — you sent the application.
- **Follow-up sent** — you contacted someone after applying.
- **Recruiter replied** or **Internal Contact Replied** — someone responded.
- **Interview scheduled** — an interview has been arranged.
- **Interview completed** — the interview took place.
- **Offer received**, **Offer accepted**, **Rejected**, or **Abandoned - no response** — the outcome is known.
- **Note added** — information that is useful but does not represent a process step.

The activity timeline is the application history. It drives the dashboard, Analytics, and Flow map.

### Full activity reference

| Activity | Choose it when | Result |
| --- | --- | --- |
| Application submitted | You have applied. | Establishes the application timeline and may create a follow-up reminder. |
| Follow-up sent | You send a check-in. | Keeps the outreach in history and may create another reminder. |
| Recruiter replied | A recruiter responds. | Records their response and may create a next action. |
| Internal Contact Replied | A referrer, hiring contact, or employee responds. | Records their response and may create a next action. |
| Interview scheduled | An interview has been arranged. | Adds the next numbered interview to the Flow map. |
| Interview completed | The interview took place. | Records the conversation and may create a thank-you reminder. |
| Thank-you sent | You sent a thank-you note. | Preserves that outreach in the application history. |
| Offer received | You receive an offer. | Changes the application outcome to Offer. |
| Offer accepted | You accept the offer. | Changes the application outcome to Accepted. |
| Rejected | The employer declines or ends the process. | Closes the application as Rejected. |
| Abandoned - no response | The process has genuinely gone cold. | Closes the application as Abandoned. |
| Note added | You need to remember context, but no process step occurred. | Adds information without representing an application milestone. |

Use the **Details** field to record information you will want later, such as the name of the interviewer, a promised follow-up date, or a short summary of a conversation. Avoid placing sensitive information in an exported backup unless you intend to protect that backup.

## 3. Schedule or reschedule an interview

For a new interview, add an **Interview scheduled** activity. Fill in both dates:

- **Scheduled on** is the date you learned about the interview.
- **Interview takes place on** is the date the interview is expected to happen.

When the interview is finished, add a separate **Interview completed** activity.

If the interview is moved, edit the existing **Interview scheduled** activity and change **Interview takes place on**. The dialog changes to **Reschedule interview** and shows the old and new dates before you save.

After saving, Job Flow keeps one interview round in the Flow map and adds an **Interview rescheduled** entry to the application timeline. That entry records the date move, so the history does not imply the interview was always set for the new date.

### Multiple rounds and corrections

There is no limit on interview rounds. Create one **Interview scheduled** activity for each new round. The Flow map labels them Interview 1, Interview 2, Interview 3, and so on, in planned-date order for that application.

An **Interview rescheduled** entry is created automatically and is read-only so the history remains clear. If the interview needs to move again, edit the original scheduled interview again. Job Flow will add another reschedule entry with the new change.

If you delete the scheduled interview itself, its linked reschedule history is removed as well. Deleting an activity cannot be undone.

## 4. Use Next Actions for follow-ups

Select **Next Action** from an application to add a reminder. Choose a due date, priority, and any notes you need.

Some activities also create useful follow-up reminders automatically. Review the **Next Actions** page regularly, then mark each item complete when you finish it. You can record how you contacted someone and retain helpful notes.

### Automatic reminders

Job Flow creates an automatic reminder only when the application is still open and there is no other open automatic reminder for that application:

- **Application submitted:** seven days later, to follow up.
- **Follow-up sent:** seven days later, to check for a reply.
- **Recruiter replied** or **Internal Contact Replied:** five days later, to reply or prepare the next step.
- **Interview completed:** the next day, to send a thank-you note.

You can always add your own Next Action. Manual next actions are separate from automatic reminders and can use any due date, priority, and note you need.

## 5. Find an application later

On the **Applications** page:

- use the search field for a company or role;
- filter by stage;
- open **Details** for that application’s activity timeline, documents, notes, and upcoming actions.

The Dashboard also highlights active, stale, and interview-related applications. Select a dashboard number to open the matching application list.

### Editing and deleting

Use **Edit** on an application to change its general information, documents, salary, application path, notes, or stage. Use **Edit** beside a timeline item to correct that activity’s date or details.

Use **Delete** carefully. Deleting an application also deletes its activities and next actions. There is no undo, so export a backup first if you might need the data later.

## 6. Read Analytics and the Flow map

**Analytics** summarizes the overall search: stages, application paths, salary ranges, document coverage, and per-application timelines.

Choose **Open full map** to review the visual Flow map. It traces applications from their source through submission, active work, interview rounds, and final outcomes.

The Flow map offers two layouts:

- **Fit to one page** is best for reviewing or sharing the whole map in one image.
- **Scrollable review** is best for inspecting a larger pipeline closely.

Before sharing publicly, select **Company aliases**. This replaces company and role details with generated labels such as Company A, Company B, and Company AA.

### What Analytics measures

The Analytics controls let you choose a grouping and chart style:

- **Segment:** group applications by Stage, application path, work mode, or whether documents are marked tailored.
- **From / To:** include applications connected to the selected date range through their creation date, activities, or next-action due dates.
- **Bars / Donut / Flow:** change the visual presentation of the selected segment. Choose Flow to open the full Flow map.

The outcome cards count applications, not every individual event. **Interview scheduled** means at least one interview was arranged. **Interviewed** means an interview was completed or the application has moved to a later interview/offer stage.

The lower analytics panels answer different questions:

- **Age metrics:** how long active applications have been open and quiet.
- **Salary:** averages and highest maximum from structured salary fields.
- **Action cadence:** time between recorded actions.
- **Application timelines:** one readable route per application, with the planned date under scheduled interview points.
- **Document coverage:** which applications have resumes, cover letters, or tailoring tracked.
- **Submissions by week:** how application volume changes over time.

### How to read the Flow map

Each route represents one application. It begins with its source, passes through Submitted and In progress, then follows any scheduled interview rounds and final outcome.

- Use **Fit to one page** for a screenshot, printout, or presentation that needs the whole map at once.
- Use **Scrollable review** when the pipeline is large and you want to inspect routes more closely.
- Interview boxes are numbered per application; a reschedule does not create another interview box.
- Completed interviews remain in activity timelines rather than creating duplicate Flow-map boxes.
- Rejected routes stay at the top and abandoned routes at the bottom so they remain visually separate from active processes.

## 7. Back up your data

Go to **Data** and select **Export JSON** periodically. The export contains applications, activities, and next actions.

Importing a JSON backup replaces the current tracker data. Export a fresh backup first if you might need to restore what is currently in the app.

The JSON export does not include uploaded document files, your passphrase, two-factor setup, or active sessions. Keep any document files you want to preserve separately.

### Restore safely

Import replaces the entire current set of applications, activities, and next actions. It does not merge two trackers. Before importing, export the current tracker with a descriptive file name, then import the backup you want to restore.

If you use document uploads, keep copies of those files separately. A JSON export stores the application records but not uploaded document contents.

## 8. Keep your tracker private

Job Flow runs locally on your computer. Select **Lock** before stepping away from it.

Do not share raw JSON backups or the app’s local data folder. Use Company aliases for a Flow-map image you intend to share. The aliases protect company and role information in the map, but you should still review anything else visible in a screenshot before publishing it.

## 9. Common workflows

### You just applied

1. Select **+ Application** and enter the role information.
2. Save it on the day you submit, or correct the generated submission activity afterward.
3. Add the tailored resume and cover letter information if useful.
4. Check **Next Actions** for the automatically generated follow-up reminder.

### A recruiter replies and schedules a call

1. Open the application and add **Recruiter replied** with the date of the response.
2. Add **Interview scheduled**. Enter the day you learned about it and the planned interview date.
3. Add a manual Next Action if you need preparation time before the interview.
4. After the call, add **Interview completed** and a note with the outcome or follow-up promised.

### An interview is moved

1. In the application timeline, edit the original **Interview scheduled** activity.
2. Change **Interview takes place on** to the new planned date.
3. Confirm the **Reschedule interview** message, then save.
4. The timeline now shows the date move; the Flow map still shows one interview round.

### You want to share your progress publicly

1. Open Analytics and select **Open full map**.
2. Choose **Fit to one page**.
3. Select **Company aliases**.
4. Review the complete screen for information outside the map before taking a screenshot or sharing it.

## 10. Troubleshooting

| What you see | What to do |
| --- | --- |
| The Guide or a new feature is missing | Reload the page. The app may be showing an older browser copy. |
| Search results are unexpectedly narrow | Clear the search text and stage filter on Applications. |
| Analytics seems to omit applications | Clear the From and To dates, then check the selected segment. |
| A Flow-map route looks different from expected | Open the application Details and confirm the scheduled interview and outcome activities and dates. |
| A reschedule does not appear | Edit the existing **Interview scheduled** activity, not an Interview completed activity; both the old and new planned dates must be present. |
| A task is overdue | Complete it, edit the related application activity, or add a new next action with a realistic due date. |
| You are about to import data | Export first. Import replaces the current tracker instead of merging it. |
| You are stepping away | Select **Lock** before leaving the computer. |

## 11. Limits to keep in mind

Job Flow is a personal, local tracker. It is not a multi-user system and does not sync data through a cloud account. Treat the local data folder, exported JSON, contact information, notes, salary data, and uploaded documents as private.

The Flow map is designed to explain an application process at a glance. For deeper context, use the written activity timeline and Details section for the individual application.
