# Windows coding through BizRouter

Download [`ADPAI-BizRouter-Windows-v2.zip`](../../downloads/ADPAI-BizRouter-Windows-v2.zip)
and extract it completely. Persian instructions are in `README-FIRST-fa.txt`.
Source scripts are included here for review; the downloadable ZIP uses CRLF for
Windows CMD files and includes an entry hash manifest.

1. Install Node.js LTS (22+) and Git for Windows if needed.
2. Run `CONNECT-WINDOWS.cmd`: install the official CLI tools in a dedicated
   user-local prefix and approve the device login in your own browser.
3. Run `START-CODING-WINDOWS.cmd`: open a separate coding session using
   BizRouter model billing, with console-management MCP disabled.

The scripts do not transfer or change billing of an existing ChatGPT session,
deploy the app, or connect the app's own image processing to BizRouter.
No keys, login sessions or private account/billing details are distributed.
Windows execution, account login, model availability and real inference remain
unverified; only official CLI argument/provider configuration was checked offline.
