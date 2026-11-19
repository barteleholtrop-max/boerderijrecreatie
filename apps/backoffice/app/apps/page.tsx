import {redirect} from 'next/navigation';
// /apps (PR #415, 12 november 2026) was een overzicht van losse apps. Besluit eigenaar dezelfde dag: één managementapp
// is goed, alleen het op het startscherm zetten moest makkelijker. Het adres blijft bestaan en opent de managementapp met
// meteen de vraag om hem op het startscherm te zetten.
export default function Apps(){redirect('/management/gesprekken?installeren=1')}
