import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "./LegalPage.scss";

const documents = {
    terms: {
        title: "Terms of Use",
        intro: "These terms explain your responsibilities when using JobPilot to discover jobs, manage your profile, and assist with applications.",
        sections: [
            ["Using JobPilot", "By continuing to sign in or using JobPilot, you agree to these terms. Use the service only for lawful job searches and applications that you are authorized to make. If you do not agree, do not use the service."],
            ["Your account and information", "You are responsible for protecting access to your sign-in account and for providing accurate profile details, résumé information, and application answers. Do not impersonate another person or submit information on their behalf without permission."],
            ["Autofill and applications", "JobPilot assists with repetitive application steps. Autofill may misunderstand a question, miss a field, or enter an incorrect answer. Review all information, attachments, and employer requirements before submitting an application. You remain responsible for the applications you choose to send. JobPilot does not guarantee interviews, job offers, or application acceptance."],
            ["Employer websites and job listings", "Listings and application websites are provided by third parties. Their availability, accuracy, eligibility requirements, terms, and privacy practices may differ from JobPilot’s. Follow the rules of each website you use. Do not use JobPilot to bypass access restrictions, verification, or anti-abuse protections."],
            ["Acceptable use", "Do not use the service for spam, fraud, harassment, unauthorized access, or activity that disrupts JobPilot or other websites. Access may be restricted to address misuse or protect the service and its users."],
            ["Availability and limitations", "JobPilot is provided as available. Features and third-party integrations may change or stop working. To the extent permitted by applicable law, JobPilot does not warrant uninterrupted or error-free operation and is not responsible for third-party hiring decisions. Nothing in these terms excludes rights or responsibilities that cannot legally be excluded."],
            ["Privacy", <>The <Link to="/privacy">Privacy Policy</Link> describes the information handled when you use JobPilot, including profile data and information entered into employer application websites.</>],
            ["Changes and questions", <>These terms may be updated as the service changes; the date above identifies this version. For questions about the service or these terms, contact the administrators through <Link to="/feedback">Feedback</Link> after signing in.</>],
        ],
    },
    privacy: {
        title: "Privacy Policy",
        intro: "This policy describes how JobPilot handles information used for your account, job search, and applications.",
        sections: [
            ["Account information", "JobPilot uses Google Sign-In to authenticate your account. It receives information such as your Google account identifier, email address, name, and profile picture. JobPilot does not receive your Google password."],
            ["Profile and application information", "JobPilot stores profile details you provide or import, including contact information, education, work experience, skills, links, and job preferences. Application features may also use résumé files and saved answers. Equal employment answers can include sensitive information such as race, gender, disability, veteran status, or sexual orientation; provide only information you want used in your applications."],
            ["Job activity and feedback", "JobPilot stores saved and blocked jobs, application history, and feedback you submit. Administrators can review feedback and job moderation records. Technical logs may record errors and application automation activity to help operate and troubleshoot the service."],
            ["How information is used", "Information is used to authenticate you, display your profile, organize job activity, assist with application fields, respond to feedback, and maintain the service. Check your saved information before starting autofill, especially sensitive answers and résumé details."],
            ["Employer websites and service providers", "When you start autofill, profile information and résumé files may be entered into an employer’s or recruiting platform’s website. Those websites may receive entered information before you press Submit. Their own privacy policies govern their handling of that information. Google handles authentication under its own policy, and infrastructure providers may process information needed to operate JobPilot."],
            ["Cookies", "JobPilot uses a session cookie to keep you signed in. The current sign-in session lasts up to seven days; signing out clears the browser’s session cookie. Google Sign-In may use its own cookies or similar technologies. Blocking cookies can prevent sign-in from working."],
            ["Storage and retention", "Account, profile, and job activity records are stored in the application database. Résumé files, application data, and technical logs may also exist in the environment running JobPilot. Records remain until removed through available controls or by administrators; signing out does not delete your account or stored records."],
            ["Your choices and requests", <>You can review and edit your profile and use the available controls to manage job activity. To request access, correction, or deletion of information that you cannot manage in the app, contact the administrators using <Link to="/feedback">Feedback</Link> after signing in. Do not include passwords or other unnecessary sensitive information in your request.</>],
            ["Security and updates", "JobPilot uses authenticated access for account features. No system can guarantee absolute security. Protect your Google account and review which information you send to job websites. This policy may change as JobPilot’s features or data practices change; the date above identifies this version."],
        ],
    },
};

export default function LegalPage({ type }) {
    const document = documents[type];
    useEffect(() => {
        const previousTitle = window.document.title;
        window.document.title = `${document.title} | JobPilot`;
        window.scrollTo(0, 0);
        return () => { window.document.title = previousTitle; };
    }, [document.title]);

    return <div className="legal-page">
        <header className="legal-header"><Link to="/login" className="legal-brand">JobPilot</Link><Link to="/login">Back to sign in</Link></header>
        <main className="legal-document">
            <nav aria-label="Legal pages"><Link to="/terms" aria-current={type === "terms" ? "page" : undefined}>Terms of Use</Link><Link to="/privacy" aria-current={type === "privacy" ? "page" : undefined}>Privacy Policy</Link></nav>
            <h1>{document.title}</h1>
            <p className="legal-date">Last updated: <time dateTime="2026-09-18">September 18, 2026</time></p>
            <p className="legal-intro">{document.intro}</p>
            {document.sections.map(([title, content], index) => <section key={title}><h2>{index + 1}. {title}</h2><p>{content}</p></section>)}
        </main>
    </div>;
}
