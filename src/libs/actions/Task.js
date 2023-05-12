import Onyx from 'react-native-onyx';
import lodashGet from 'lodash/get';
import Str from 'expensify-common/lib/str';
import ONYXKEYS from '../../ONYXKEYS';
import * as API from '../API';
import * as ReportUtils from '../ReportUtils';
import * as Report from './Report';
import Navigation from '../Navigation/Navigation';
import ROUTES from '../../ROUTES';
import DateUtils from '../DateUtils';

/**
 * Clears out the task info from the store
 */
function clearOutTaskInfo() {
    Onyx.set(ONYXKEYS.TASK, null);
}

/**
 * Assign a task to a user
 * Function title is createTask for consistency with the rest of the actions
 * and also because we can create a task without assigning it to anyone
 * @param {String} currentUserEmail
 * @param {String} parentReportID
 * @param {String} title
 * @param {String} description
 * @param {String} assignee
 *
 */

function createTaskAndNavigate(currentUserEmail, parentReportID, title, description, assignee = '') {
    // Create the task report
    const optimisticTaskReport = ReportUtils.buildOptimisticTaskReport(currentUserEmail, assignee, parentReportID, title, description);

    // Grab the assigneeChatReportID if there is an assignee and if it's not the same as the parentReportID
    // then we create an optimistic add comment report action on the assignee's chat to notify them of the task
    const assigneeChatReportID = lodashGet(ReportUtils.getChatByParticipants([assignee]), 'reportID');
    const taskReportID = optimisticTaskReport.reportID;
    let optimisticAssigneeAddComment;
    if (assigneeChatReportID && assigneeChatReportID !== parentReportID) {
        optimisticAssigneeAddComment = ReportUtils.buildOptimisticTaskCommentReportAction(taskReportID, title, assignee, `Assigned a task to you: ${title}`);
    }

    // Create the CreatedReportAction on the task
    const optimisticTaskCreatedAction = ReportUtils.buildOptimisticCreatedReportAction(optimisticTaskReport.reportID);
    const optimisticAddCommentReport = ReportUtils.buildOptimisticTaskCommentReportAction(taskReportID, title, assignee, `Created a task: ${title}`);

    const currentTime = DateUtils.getDBTime();

    const lastCommentText = ReportUtils.formatReportLastMessageText(optimisticAddCommentReport.reportAction.message[0].text);

    const optimisticReport = {
        lastVisibleActionCreated: currentTime,
        lastMessageText: Str.htmlDecode(lastCommentText),
        lastActorEmail: currentUserEmail,
        lastReadTime: currentTime,
    };

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticTaskReport.reportID}`,
            value: optimisticTaskReport,
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticTaskReport.reportID}`,
            value: {[optimisticTaskCreatedAction.reportActionID]: optimisticTaskCreatedAction},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${parentReportID}`,
            value: {[optimisticAddCommentReport.reportAction.reportActionID]: optimisticAddCommentReport.reportAction},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${parentReportID}`,
            value: optimisticReport,
        },
    ];

    const successData = [];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticTaskReport.reportID}`,
            value: null,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticTaskReport.reportID}`,
            value: {[optimisticTaskCreatedAction.reportActionID]: {pendingAction: null}},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${parentReportID}`,
            value: {[optimisticAddCommentReport.reportAction.reportActionID]: {pendingAction: null}},
        },
    ];

    if (optimisticAssigneeAddComment) {
        const lastAssigneeCommentText = ReportUtils.formatReportLastMessageText(optimisticAssigneeAddComment.reportAction.message[0].text);

        const optimisticAssigneeReport = {
            lastVisibleActionCreated: currentTime,
            lastMessageText: Str.htmlDecode(lastAssigneeCommentText),
            lastActorEmail: currentUserEmail,
            lastReadTime: currentTime,
        };

        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${assigneeChatReportID}`,
                value: {[optimisticAssigneeAddComment.reportAction.reportActionID]: optimisticAssigneeAddComment.reportAction},
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${assigneeChatReportID}`,
                value: optimisticAssigneeReport,
            },
        );

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${assigneeChatReportID}`,
            value: {[optimisticAssigneeAddComment.reportAction.reportActionID]: {pendingAction: null}},
        });
    }

    API.write(
        'CreateTask',
        {
            parentReportActionID: optimisticAddCommentReport.reportAction.reportActionID,
            parentReportID,
            taskReportID: optimisticTaskReport.reportID,
            createdTaskReportActionID: optimisticTaskCreatedAction.reportActionID,
            reportName: optimisticTaskReport.reportName,
            title: optimisticTaskReport.reportName,
            description: optimisticTaskReport.description,
            assignee,
            assigneeChatReportID,
            assigneeChatReportActionID: optimisticAssigneeAddComment ? optimisticAssigneeAddComment.reportAction.reportActionID : 0,
        },
        {optimisticData, successData, failureData},
    );

    clearOutTaskInfo();

    Navigation.navigate(ROUTES.getReportRoute(optimisticTaskReport.reportID));
}

/**
 * @function editTask
 * @param {object} report
 * @param {string} ownerEmail
 * @param {string} title
 * @param {string} description
 * @param {string} assignee
 * @returns {object} action
 *
 */

function editTaskAndNavigate(report, ownerEmail, title, description, assignee) {
    // Create the EditedReportAction on the task
    const editTaskReportAction = ReportUtils.buildOptimisticEditedTaskReportAction(ownerEmail);

    // If we make a change to the assignee, we want to add a comment to the assignee's chat
    let optimisticAssigneeAddComment;
    let assigneeChatReportID;
    if (assignee && assignee !== report.assignee) {
        assigneeChatReportID = ReportUtils.getChatByParticipants([assignee]).reportID;
        optimisticAssigneeAddComment = ReportUtils.buildOptimisticTaskCommentReportAction(report.reportID, title, assignee, `Assigned a task to you: ${title}`);
    }

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report.reportID}`,
            value: {[editTaskReportAction.reportActionID]: editTaskReportAction},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${report.reportID}`,
            value: {
                ...report,
                reportName: title || report.reportName,
                description: description || report.description,
                assignee: assignee || report.assignee,
            },
        },
    ];
    const successData = [];
    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report.reportID}`,
            value: {[editTaskReportAction.reportActionID]: {pendingAction: null}},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${report.reportID}`,
            value: {reportName: report.reportName, description: report.description, assignee: report.assignee},
        },
    ];

    if (optimisticAssigneeAddComment) {
        const currentTime = DateUtils.getDBTime();
        const lastAssigneeCommentText = ReportUtils.formatReportLastMessageText(optimisticAssigneeAddComment.reportAction.message[0].text);

        const optimisticAssigneeReport = {
            lastVisibleActionCreated: currentTime,
            lastMessageText: Str.htmlDecode(lastAssigneeCommentText),
            lastActorEmail: ownerEmail,
            lastReadTime: currentTime,
        };

        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${assigneeChatReportID}`,
                value: {[optimisticAssigneeAddComment.reportAction.reportActionID]: optimisticAssigneeAddComment.reportAction},
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${assigneeChatReportID}`,
                value: optimisticAssigneeReport,
            },
        );

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${assigneeChatReportID}`,
            value: {[optimisticAssigneeAddComment.reportAction.reportActionID]: {pendingAction: null}},
        });
    }

    API.write(
        'EditTask',
        {
            taskID: report.reportID,
            title: title || report.reportName,
            description: description || report.description,
            assignee: assignee || report.assignee,
            editedTaskReportActionID: editTaskReportAction.reportActionID,
            assigneeChatReportActionID: optimisticAssigneeAddComment ? optimisticAssigneeAddComment.reportAction.reportActionID : 0,
        },
        {optimisticData, successData, failureData},
    );

    Navigation.navigate(ROUTES.getReportRoute(report.reportID));
}

/**
 * Sets the report info for the task being viewed
 *
 * @param {Object} report
 */
function setTaskReport(report) {
    Onyx.merge(ONYXKEYS.TASK, {report});
}

/**
 * Sets the title and description values for the task
 * @param {string} title
 * @param {string} description
 */

function setDetailsValue(title, description) {
    // This is only needed for creation of a new task and so it should only be stored locally
    Onyx.merge(ONYXKEYS.TASK, {title, description});
}

/**
 * Sets the title value for the task
 * @param {string} title
 */
function setTitleValue(title) {
    Onyx.merge(ONYXKEYS.TASK, {title});
}

/**
 * Sets the description value for the task
 * @param {string} description
 */
function setDescriptionValue(description) {
    Onyx.merge(ONYXKEYS.TASK, {description});
}

/**
 * Sets the shareDestination value for the task
 * @param {string} shareDestination
 */
function setShareDestinationValue(shareDestination) {
    // This is only needed for creation of a new task and so it should only be stored locally
    Onyx.merge(ONYXKEYS.TASK, {shareDestination});
}

/**
 * Sets the assignee value for the task and checks for an existing chat with the assignee
 * If there is no existing chat, it creates an optimistic chat report
 * It also sets the shareDestination as that chat report if a share destination isn't already set
 * @param {string} assignee
 * @param {string} shareDestination
 */

function setAssigneeValue(assignee, shareDestination) {
    let newChat = {};
    const chat = ReportUtils.getChatByParticipants([assignee]);
    if (!chat) {
        newChat = ReportUtils.buildOptimisticChatReport([assignee]);
    }
    const reportID = chat ? chat.reportID : newChat.reportID;

    if (!shareDestination) {
        setShareDestinationValue(reportID);
    }

    Report.openReport(reportID, [assignee], newChat);

    // This is only needed for creation of a new task and so it should only be stored locally
    Onyx.merge(ONYXKEYS.TASK, {assignee});
}

/**
 * Sets the parentReportID value for the task
 * @param {string} parentReportID
 */

function setParentReportID(parentReportID) {
    // This is only needed for creation of a new task and so it should only be stored locally
    Onyx.merge(ONYXKEYS.TASK, {parentReportID});
}

/**
 * Clears out the task info from the store and navigates to the NewTaskDetails page
 * @param {string} reportID
 */
function clearOutTaskInfoAndNavigate(reportID) {
    clearOutTaskInfo();
    setParentReportID(reportID);
    Navigation.navigate(ROUTES.NEW_TASK_DETAILS);
}

/**
 * Get the assignee data
 *
 * @param {Object} details
 * @returns {Object}
 */
function getAssignee(details) {
    const source = ReportUtils.getAvatar(lodashGet(details, 'avatar', ''), lodashGet(details, 'login', ''));
    return {
        icons: [{source, type: 'avatar', name: details.login}],
        displayName: details.displayName,
        subtitle: details.login,
    };
}

/**
 * Get the share destination data
 * @param {Object} reportID
 * @param {Object} reports
 * @param {Object} personalDetails
 * @returns {Object}
 * */
function getShareDestination(reportID, reports, personalDetails) {
    const report = lodashGet(reports, `report_${reportID}`, {});
    return {
        icons: ReportUtils.getIcons(report, personalDetails),
        displayName: ReportUtils.getReportName(report),
        subtitle: ReportUtils.getChatRoomSubtitle(report),
    };
}

export {
    createTaskAndNavigate,
    editTaskAndNavigate,
    setTitleValue,
    setDescriptionValue,
    setTaskReport,
    setDetailsValue,
    setAssigneeValue,
    setShareDestinationValue,
    clearOutTaskInfo,
    clearOutTaskInfoAndNavigate,
    getAssignee,
    getShareDestination,
};
