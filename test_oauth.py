from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform"
]

flow = InstalledAppFlow.from_client_secrets_file(
    "oauth_client.json",
    SCOPES
)

credentials = flow.run_local_server(port=0)

print("\nOAuth OK")
print("Token obtenu :", bool(credentials.token))
print("Projet :", credentials.quota_project_id)
