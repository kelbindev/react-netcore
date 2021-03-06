import { makeAutoObservable, reaction, runInAction, } from "mobx"
import agent from "../api/agent";
import { Activity, ActivityFormValues } from "../models/activity"
import { v4 as uuid } from 'uuid'
import { format } from 'date-fns'
import { store } from "./store";
import { Profile } from "../models/profile";
import { Pagination, PagingParams } from "../models/pagination";

export default class ActivityStore {
    activityRegistry = new Map<String, Activity>();
    selectedActivity: Activity | undefined = undefined;
    isEditMode: boolean = false;
    isSubmitting: boolean = false;
    loadingInitial: boolean = false;
    pagination: Pagination | null = null;
    pagingParams = new PagingParams();
    predicate = new Map().set('all', true);

    constructor() {
        makeAutoObservable(this)

        reaction(
            () => this.predicate.keys(),
            () => {
                this.pagingParams = new PagingParams();
                this.activityRegistry.clear();
                this.loadAcitivites();
            }
        )
    }

    setPagingParams = (pagingParams: PagingParams) => {
        this.pagingParams = pagingParams;
    }

    setPredicate = (predicate: string, value: string | Date) => {
        const resetPredicate = () => {
            this.predicate.forEach((val, key) => {
                if (key !== 'startDate') { this.predicate.delete(key) }
            })
        }

        switch (predicate) {
            case 'all':
                resetPredicate();
                this.predicate.set('all', true);
                break;
            case 'isGoing':
                resetPredicate();
                this.predicate.set('isGoing', true);
                break;
            case 'isHost':
                resetPredicate();
                this.predicate.set('isHost', true);
                break;
            case 'startDate':
                this.predicate.delete('startDate');
                this.predicate.set('startDate', value);
                break;
        }
    }

    get axiosParams() {
        const params = new URLSearchParams();
        params.append('pageNumber', this.pagingParams.pageNumber.toString());
        params.append('pageSize', this.pagingParams.pageSize.toString());

        this.predicate.forEach((val, key) => {
            if (key === 'startDate') {
                params.append(key, (val as Date).toISOString());
            } else {
                params.append(key, val);
            }
        })

        return params;
    }

    get activities() {
        return Array.from(this.activityRegistry.values()).sort((a, b) =>
            a.date!.getTime() - b.date!.getTime())
    }

    get groupedActivities() {
        return Object.entries(
            this.activities.reduce((_activities, _activity) => {
                const date = format(_activity.date!, 'dd MMM yyyy')
                _activities[date] = _activities[date] ? [..._activities[date], _activity] : [_activity]
                return _activities
            }, {} as { [key: string]: Activity[] })
        )
    }

    setLoading(loading: boolean) {
        this.loadingInitial = loading
    }

    setEditMode(isEdit: boolean) {
        this.isEditMode = isEdit
    }

    loadAcitivites = async () => {
        this.setLoading(true);

        try {
            const result = await agent.Activities.list(this.axiosParams)

            result.data.forEach(e => {
                this.setActivity(e)
            })
            this.setPagination(result.pagination);
            this.setLoading(false);

        }
        catch (error) {
            console.log(error);

            this.setLoading(false);
        }
    }

    setPagination = (pagination: Pagination) => {
        this.pagination = pagination;
    }

    loadActivity = async (id: string) => {
        let activity = this.getActivity(id);
        if (activity) {
            this.selectedActivity = activity;
            return activity;
        } else {
            this.loadingInitial = true;
            try {
                activity = await (await agent.Activities.details(id));
                this.setActivity(activity);
                runInAction(() => {
                    this.selectedActivity = activity;
                })

                this.setLoading(false);
                return activity;
            }
            catch (error) {
                console.log(error);
                this.setLoading(false);
            }
        }
    }

    private getActivity(id: string) {
        return this.activityRegistry.get(id);
    }

    private setActivity(activity: Activity) {
        var user = store.userStore.user;
        if (user) {
            activity.isGoing = activity.attendees?.some(x => x.username === user?.username)
            activity.isHost = activity.hostUsername === user.username
            activity.host = activity.attendees?.find(x => x.username === activity.hostUsername)
        }

        activity.date = new Date(activity.date!)
        this.activityRegistry.set(activity.id, activity)
    }

    createActivity = async (activity: ActivityFormValues) => {
        const user = store.userStore.user;
        const attendee = new Profile(user!);
        try {
            activity.id = uuid()
            await agent.Activities.create(activity)
            var newActivity = new Activity(activity)
            newActivity.hostUsername = user?.username
            newActivity.attendees = [attendee]
            this.setActivity(newActivity)
            runInAction(() => {
                this.selectedActivity = newActivity
            })
        }
        catch (error) {
            console.log(error)
        }
    }

    updateActivity = async (activity: ActivityFormValues) => {
        try {
            await agent.Activities.update(activity)
            runInAction(() => {
                if (activity.id) {
                    let updatedActivity = { ...this.getActivity(activity.id), ...activity }
                    this.activityRegistry.set(activity.id, updatedActivity as Activity)
                    this.selectedActivity = updatedActivity as Activity
                }
            })
        }
        catch (error) {
            console.log(error)
            runInAction(() => {
                this.isSubmitting = false;
            })
        }
    }

    deleteActivity = async (id: string) => {
        this.isSubmitting = true;
        try {
            await agent.Activities.delete(id);
            // this.activities = [...this.activities.filter(x => x.id !== id)]
            this.activityRegistry.delete(id);
            runInAction(() => {
                this.isSubmitting = false;
            })
        }
        catch (error) {
            console.log(error);
            runInAction(() => {
                this.isSubmitting = false;
            })
        }
    }

    updateAttendance = async () => {
        var user = store.userStore.user;
        this.isSubmitting = true

        try {
            await agent.Activities.attend(this.selectedActivity!.id)
            runInAction(() => {
                if (this.selectedActivity?.isGoing) {
                    this.selectedActivity!.attendees =
                        this.selectedActivity?.attendees?.filter(x => x.username !== user?.username)
                    this.selectedActivity.isGoing = false;
                }
                else {
                    const attendee = new Profile(user!)
                    this.selectedActivity?.attendees?.push(attendee)
                    this.selectedActivity!.isGoing = true;
                }

                this.activityRegistry.set(this.selectedActivity!.id, this.selectedActivity!)
            })
        } catch (error) {
            console.log(error)
        } finally {
            this.isSubmitting = false
        }

    }

    cancelActivityToggle = async () => {
        this.isSubmitting = true;
        try {
            await agent.Activities.attend(this.selectedActivity!.id)
            runInAction(() => {
                this.selectedActivity!.isCancelled = !this.selectedActivity?.isCancelled
                this.activityRegistry.set(this.selectedActivity!.id, this.selectedActivity!)
            }
            )
        } catch (error) {

        }
        finally {
            runInAction(() => this.isSubmitting = false)
        }
    }

    clearSelectedActivity = () => {
        this.selectedActivity = undefined;
    }

    updateAttendeeFollowing = (username: string) => {
        this.activityRegistry.forEach(e => {
            e.attendees.forEach(at => {
                if (at.username === username) {
                    at.following ? at.followersCount-- : at.followersCount++;
                    at.following = !at.following
                }
            })
        })
    }

}