import {useEffect, useRef, useState} from 'react';
import {getUserProfile, updateUserProfileSection} from '../../../connector';

// Serialize read/modify/write operations so rapid clicks cannot overwrite one
// another. The latest intent wins visually, even while earlier writes finish.
export default function useOptimisticSkills(onSaved) {
    const [choices, setChoices] = useState({});
    const [error, setError] = useState('');
    const queue = useRef(Promise.resolve());
    const latest = useRef({});
    const mounted = useRef(true);
    const revision = useRef(0);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const toggle = (skill, previous, matches) => {
        const value = !(latest.current[skill]?.value ?? previous);
        const intent = {value};
        const version = ++revision.current;
        latest.current[skill] = intent;
        setChoices(current => ({...current, [skill]: value}));
        setError('');
        queue.current = queue.current.then(async () => {
            const profile = await getUserProfile();
            const skills = Array.isArray(profile.skills) ? profile.skills : [];
            intent.before = skills.some(saved => matches(saved, skill));
            const next = value
                ? (intent.before ? skills : [...skills, skill])
                : skills.filter(saved => !matches(saved, skill));
            await updateUserProfileSection('skills', next);
            // Refresh the score only after the last queued edit. Do not let a
            // slow score fetch hold up subsequent skill writes or roll them back.
            if (mounted.current && revision.current === version && onSaved) {
                Promise.resolve(onSaved(() => mounted.current && revision.current === version)).catch(() => {});
            }
        }).catch(() => {
            if (!mounted.current || latest.current[skill] !== intent) return;
            delete latest.current[skill];
            setChoices(current => ({...current, [skill]: intent.before ?? previous}));
            setError(`Could not save “${skill}”. Your selection was restored; click the tag to retry.`);
        });
        return value;
    };
    return {choices, error, toggle};
}
