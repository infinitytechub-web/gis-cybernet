# Update the sign-in page photo: rank insignia and lanyards

Edit the existing sign-in photo (`src/assets/login-hrm.jpg`) in place. Do not generate a new image.

## Changes to the photo
- Take the 🔰 badges and the current rank insignia off both officers' shoulders.
- Lady officer: put three stars on each shoulder epaulette, evenly spaced and lined up along the strap.
- Male officer: put a crown above a single star on each shoulder epaulette, centred on the strap.
- The insignia should be metallic and embroidered to match the uniform, with the same lighting, angle and scale as the shoulder.
- Change the lanyards to yellow and green, neatly woven and lying naturally.
- Keep the faces, expressions, poses, background and overall look the same, and keep the photo sharp and realistic.

## Technical details
- Use the image edit tool with `login-hrm.jpg` as the source and save the result back to the same path. This keeps the original size, so `Login.tsx` needs no change.
- Look at the result. If the insignia are in the wrong place or faces have drifted, re-run with a more precise prompt or a shoulder mask.
- Take a screenshot of `/login` at desktop width to confirm the photo panel displays.
