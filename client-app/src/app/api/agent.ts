import axios, { AxiosError, AxiosResponse } from 'axios'
import { toast } from 'react-toastify';
import { history } from '../..';
import { Activity, ActivityFormValues } from '../models/activity';
import { store } from '../stores/store';
import {User,UserFormValues} from '../models/user'
import { Photo, Profile } from '../models/profile';
import { PaginatedResult } from '../models/pagination';
import { ProfileActivity } from '../models/profileActivity';

axios.defaults.baseURL = process.env.REACT_APP_API_URL;

const responseBody = <T>(response: AxiosResponse<T>) => response.data;

const request = {
    get: <T>(url: string) => axios.get<T>(url).then(responseBody),
    post: <T>(url: string, body: {}) => axios.post<T>(url,body).then(responseBody),
    put: <T>(url: string, body: {}) => axios.put<T>(url,body).then(responseBody),
    del: <T>(url: string) => axios.delete<T>(url).then(responseBody),
}

axios.interceptors.request.use(config => {
    const token = store.commonStore.token;
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config;
})

axios.interceptors.response.use(
    async response => {
        const pagination = response.headers['pagination'];
        if (pagination){
            response.data = new PaginatedResult(response.data,JSON.parse(pagination));
            return response  as AxiosResponse<PaginatedResult<any>>;
        };
        return response;
    }, (error: AxiosError) => {
        const { data, status, config } = error.response!;
        console.log('axios intercepts');
        switch (status) {
            case 400:
                if (typeof data === 'string'){
                    toast.error(data);
                }
                if (config.method === 'get' && data.errors.hasOwnProperty('id')) {
                    history.push('/not-found');
                }
                console.log(data);
                if (data.errors) {
                    const modalStateErrors = [];
                    for (const key in data.errors) {
                        if (data.errors[key]) {
                            modalStateErrors.push(data.errors[key]);
                        }
                    }
                    throw modalStateErrors.flat();
                }
                else {
                    toast.error(data);
                }

                break;
            case 401:
                toast.error('unauthorized');
                break;
            case 404:
                history.push('/notfound');
                break;
            case 500:
                store.commonStore.setServerError(data);
                history.push('/server-error')
                break;
        }
        return Promise.reject(error);
    }
)

const Activities = {
list: (params: URLSearchParams) => axios.get<PaginatedResult<Activity[]>>('/activities',{params}).then(responseBody),
    details: (id: string) => request.get<Activity>(`/activities/${id}`),
    create: (activity: ActivityFormValues) => request.post<void>('/activities/', activity),
    update: (activity: ActivityFormValues) => request.put<void>(`/activities/${activity.id}`, activity),
    delete: (id: string) => request.del<void>(`/activities/${id}`),
    attend: (id:string) => request.post<void>(`/activities/${id}/attend`,{})
}

const Account = {
    current: () => request.get<User>("/account"),
    login: (user: UserFormValues) => request.post<User>('/account/login',user),
    register: (user: UserFormValues) => request.post<User>('/account/register',user)
}

const Profiles = {
    get: (username:string)=> request.get<Profile>(`/profiles/${username}`),
    uploadPhoto: (file:Blob) => {
        let formData = new FormData();
        formData.append('File',file)
        return axios.post<Photo>('photo', formData, {
            headers: {'Content-type': 'multipart/form-data'}
        })
    },
    setMainPhoto: (id: string) => request.post(`/photo/${id}/setMain`,{}),
    deletePhoto: (id: string) => request.del(`/photo/${id}`),
    updateAbout: (profile: Profile) => request.post<void>(`/profiles/updateAbout`,profile),
    updateFollowing: (username:string) => request.post<void>(`/follow/${username}`,{}),
    listFollowing: (username:string, predicate:string) => request.get<Profile[]>(`/follow/${username}?predicate=${predicate}`),
    getProfileActivities: (username:string, predicate:string) => 
        request.get<ProfileActivity[]>(`/profiles/${username}/activities?predicate=${predicate}`)
}

const agent = {
    Activities,
    Account,
    Profiles
}

export default agent;