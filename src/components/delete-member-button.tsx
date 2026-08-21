"use client";
export function DeleteMemberButton({action,name}:{action:()=>void|Promise<void>;name:string}){
  return <form action={action} onSubmit={event=>{const answer=window.prompt(`This permanently removes ${name}, including memberships, invoices, payments, and attendance. Type DELETE to continue.`);if(answer!=="DELETE")event.preventDefault()}}><button className="btn btn-danger" type="submit">Delete member permanently</button></form>;
}
