# Job Flow User Guide

Job Flow is a local application for recording job applications and the real activity that occurs during each process. Use it in this order: create an application, record activity as it happens, and review the pipeline in Analytics.

## 1. Add an application

Select **+ Application**. Enter the company and role, then add the information useful to you:

- location, work mode, salary range, and job link;
- application path: Direct, Referral, or Headhunter;
- documents and tailoring notes associated with the role.

Create each submission record only once. Job Flow creates an **Application submitted** activity when a new application is saved. If you are recording an earlier submission, edit that activity to the actual date afterward.

### Application stages

The Stage field is a quick current-status label. Recorded terminal activities are authoritative:

- **Offer received** sets the stage to Offer.
- **Offer accepted** sets the stage to Accepted.
- **Rejected** sets the stage to Rejected.
- **Abandoned - no response** sets the stage to Abandoned.

If you choose one of these terminal stages directly in the application editor, Job Flow records the matching terminal activity so the activity history and current stage stay aligned.

## 2. Record activity as it happens

Open an application and select **Activity** whenever something real happens. Add the date and, if useful, details you will want to remember later.

| Activity | Choose it when | Result |
| --- | --- | --- |
| Application submitted | You have applied. | Establishes the application timeline. |
| Follow-up sent | You send a real check-in. | Records the outreach in history. |
| Recruiter replied | A recruiter responds. | Records the response in history. |
| Internal Contact Replied | A referrer, hiring contact, or employee responds. | Records the response in history. |
| Interview scheduled | An interview has been arranged. | Adds the next numbered interview to the Flow map. |
| Interview completed | The interview took place. | Records the completed conversation. |
| Thank-you sent | You send a thank-you note. | Keeps that outreach in the timeline. |
| Offer received / accepted | You receive or accept an offer. | Updates the terminal stage. |
| Rejected / Abandoned | The employer declines or the process has genuinely gone cold. | Updates the terminal stage and Flow-map outcome. |
| Note added | You need to preserve context without recording a process step. | Adds information without changing the stage. |

Notes, replies, and ordinary activity never overwrite a recorded terminal outcome. Editing or deleting a terminal activity recalculates the saved stage from the remaining history.

## 3. Schedule or reschedule an interview

For a new interview, add an **Interview scheduled** activity and complete both dates:

- **Scheduled on**: the date you learned about the interview.
- **Interview takes place on**: the planned interview date.

When the interview is finished, add a separate **Interview completed** activity.

If the date changes, edit the original **Interview scheduled** activity and change **Interview takes place on**. Job Flow shows a reschedule confirmation and retains a read-only history entry with the old and new dates. That correction remains one interview round in the Flow map.

There is no limit on interview rounds. Add one **Interview scheduled** activity for each new round; the map labels them Interview 1, Interview 2, Interview 3, and so on.

## 4. Find and review applications

On **Applications**, use the search field for a company or role, then filter by stage. Open **Details** to review the timeline, documents, and notes for one application.

The Dashboard highlights active, stale, and interview-related applications. Select a dashboard number to open the matching application list.

Use **Edit** on an application to change its general information, documents, salary, application path, notes, or stage. Use **Edit** beside a timeline item to correct that activity’s date or details.

Use **Delete** carefully. Deleting an application also deletes its activities. There is no undo, so create a private backup first if you might need the data later.

## 5. Read Analytics and the Flow map

**Analytics** summarizes stages, application paths, salary ranges, document coverage, submission trends, and per-application timelines.

Choose **Open full map** to review the visual Flow map. Each route represents one application: it begins with the application path, continues through submission and active work, then shows interview rounds and an outcome when one is recorded.

The full map offers two layouts:

- **Fit to one page**: best for a complete screenshot, printout, or presentation.
- **Scrollable review**: best for inspecting a larger pipeline closely.

Before sharing a map publicly, choose **Company aliases**. This replaces company and role labels with stable aliases such as Company A, Company B, and Company AA. Review the entire image before publishing because that setting protects map labels, not content outside the map.

### What the Analytics panels measure

- **Outcomes** count applications, not every event.
- **Interview scheduled** means at least one interview was arranged.
- **Interviewed** means an interview was completed or the application moved to a later interview or offer stage.
- **Age metrics** show how long active applications have been open and quiet.
- **Activity cadence** measures time between recorded activities.
- **Application timelines** show one readable route per application, using the planned date under scheduled interview points.
- **Submissions by week** keeps every weekly count while showing a readable subset of date labels on crowded charts.

## 6. Back up your data

Open **Data** and choose **Export private backup** periodically. This JSON file is the only export that can restore Job Flow. It contains applications and activities and may contain private notes, contact details, document information, URLs, and salary data, so keep it private.

The new private-backup format contains:

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-09-05T00:00:00.000Z",
  "applications": [],
  "events": []
}
```

Import replaces the current applications and activities; it does not merge two trackers. Older backups that contain a `tasks` array still import, but those historical task records are ignored. Uploaded document files, passphrases, two-factor configuration, and active sessions are not included.

## 7. Create a sanitized brief

Choose **Export sanitized brief** when you want an analysis tool to review your job search without receiving the private tracker data. It creates `jobflow-sanitized-brief-YYYY-MM-DD.md`.

The brief is built from an allowlist, not from a raw backup. It includes aggregate counts, submission trends, routes, normalized outcomes, conversion measures, work modes, deterministic seniority signals, rejection timing, and compact interview processes using only company, role, stage sequence, and date-only milestones.

It excludes candidate and contact information, notes, activity descriptions, documents, local paths, URLs, IDs, exact times, tasks, salary, obsolete fields, and free-form opinions. A secondary privacy check cancels the export if obvious email, URL, local-path, or phone-number patterns are detected. The brief is read-only and cannot be imported.

## 8. Keep your tracker private

Job Flow runs locally on your computer. Select **Lock** before stepping away from it. Do not share raw backups or the local `data/` folder. Use the sanitized brief for external analysis and Company aliases for a Flow-map image intended for sharing.

## Common troubleshooting

| If this happens | Try this |
| --- | --- |
| Search seems wrong | Clear the search text and stage filter. |
| Analytics seems incomplete | Clear the From and To date filters. |
| A terminal stage looks wrong | Edit or delete the recorded terminal activity; the stored stage then reconciles from the remaining history. |
| The app looks outdated after an update | Reload the browser page. |
| You need to restore older data | Export a fresh private backup first, then import the older JSON backup. |
