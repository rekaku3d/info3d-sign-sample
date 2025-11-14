        import * as THREE from 'three';
        import { OrbitControls } from 'OrbitControls';

        // --- 1. MODAL / POP-UP LOGIC (Same as before) ---
        
        // --- Information Database ---
        const buildingInfo = {
            sign_welcome: {
                title: 'Welcome!',
                info: 'This is an interactive 3D sign. Click any of the signs to learn more about different topics. Use your mouse to rotate.'
            },
            sign_features: {
                title: '✨ Ask About Features',
                // Info is now a prompt for the user
                info: 'This is now an interactive assistant. Ask a question!'
            },
            sign_about: {
                title: 'About Us',
                info: 'We are a company dedicated to building innovative 3D web experiences. We were founded in 2024.'
            },
            sign_contact: {
                title: 'Contact Info',
                info: 'You can reach us at info@example.com or by calling 555-1234. Our offices are open 9-5, M-F.'
            },
            ground: {
                title: 'Ground Plane',
                info: 'This is the base of our scene. It helps anchor the 3D object in space.'
            }
        };

        const modal = document.getElementById('info-modal');
        const modalContent = document.getElementById('modal-content');
        const modalTitle = document.getElementById('modal-title');
        
        // Modal content containers
        const staticInfoContainer = document.getElementById('static-info-container');
        const modalInfo = document.getElementById('modal-info');
        
        const geminiInfoContainer = document.getElementById('gemini-info-container');
        const geminiPrompt = document.getElementById('gemini-prompt');
        const geminiSend = document.getElementById('gemini-send');
        const geminiResponseContainer = document.getElementById('gemini-response-container');
        
        const closeModalBtn = document.getElementById('close-modal');

        function openModal(partId, x, y) {
            const info = buildingInfo[partId];
            if (!info) return;

            modalTitle.textContent = info.title;
            
            // --- Conditional Content Display ---
            if (partId === 'sign_features') {
                // Show Gemini UI
                staticInfoContainer.classList.add('hidden');
                geminiInfoContainer.classList.remove('hidden');
                geminiResponseContainer.innerHTML = '<p class="text-gray-500">I am ready to answer your questions!</p>';
                geminiPrompt.value = '';
            } else {
                // Show static UI
                staticInfoContainer.classList.remove('hidden');
                geminiInfoContainer.classList.add('hidden');
                modalInfo.textContent = info.info;
            }

            // Set position near the click
            modal.style.left = `${x + 10}px`;
            modal.style.top = `${y}px`; // Align top with cursor
            
            // Set transform to pop up and scale in
            modal.style.transform = 'translateY(-100%) scale(1)';

            modal.classList.remove('invisible', 'opacity-0');
        }

        function closeModal() {
            // Animate out by scaling down
            modal.style.transform = 'translateY(-100%) scale(0.9)';
            modal.classList.add('opacity-0');
            
            setTimeout(() => {
                modal.classList.add('invisible');
                // Clear Gemini state
                geminiPrompt.value = '';
                geminiResponseContainer.innerHTML = '';
            }, 200); // Must match transition duration
        }

        closeModalBtn.addEventListener('click', closeModal);
        
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        });
        
        // --- 4. GEMINI API LOGIC ---
        
        geminiSend.addEventListener('click', handleGeminiRequest);
        geminiPrompt.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                handleGeminiRequest();
            }
        });
        
        async function handleGeminiRequest() {
            const userQuery = geminiPrompt.value;
            if (!userQuery.trim()) {
                geminiResponseContainer.innerHTML = '<p class="text-red-500">Please enter a question.</p>';
                return;
            }
            
            geminiResponseContainer.innerHTML = '<div class="loader"></div>';
            
            try {
                const responseText = await callGeminiAPI(userQuery);
                geminiResponseContainer.innerHTML = `<p>${responseText}</p>`;
            } catch (error) {
                console.error("Gemini API Error:", error);
                geminiResponseContainer.innerHTML = '<p class="text-red-500">Sorry, I encountered an error. Please try again.</p>';
            }
        }
        
        // Helper function for exponential backoff
        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function callGeminiAPI(userQuery) {
            const apiKey = ""; // Leave empty, will be handled by the environment
            const apiUrl = `https://generativelace.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            
            const systemPrompt = "You are a helpful, friendly assistant for a company that builds 3D web experiences. Answer questions about the company's features. The company's features include: 1. Interactive 3D model design. 2. WebGL and three.js development. 3. E-commerce 3D product viewers. 4. 3D data visualization. 5. Virtual tours and architectural walkthroughs. Keep your answers concise, informative, and in a single paragraph.";

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
            };
            
            let response;
            let retries = 3;
            let delay = 1000;

            for (let i = 0; i < retries; i++) {
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) {
                            return text;
                        } else {
                            throw new Error("Invalid response structure from API.");
                        }
                    } else if (response.status === 429 || response.status >= 500) {
                        // Handle rate limiting or server errors with retry
                        console.warn(`Attempt ${i+1}: Retrying after ${delay}ms...`);
                        await sleep(delay);
                        delay *= 2; // Exponential backoff
                    } else {
                        // Handle other errors (e.g., 400 Bad Request)
                        const errorResult = await response.json();
                        console.error("API Error:", errorResult);
                        throw new Error(errorResult.error?.message || "An unknown API error occurred.");
                    }
                } catch (error) {
                    console.error("Fetch Error:", error);
                    if (i === retries - 1) throw error; // Re-throw last error
                    await sleep(delay);
                    delay *= 2;
                }
            }
            throw new Error("Failed to get a response from the API after several retries.");
        }

        // --- 2. THREE.JS 3D SCENE SETUP ---

        let scene, camera, renderer, controls;
        let raycaster, mouse;
        const clickableObjects = []; // To store our building parts

        function init() {
            // Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x334155); // bg-slate-700

            // Camera
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(10, 10, 10);

            // Renderer
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);

            // Controls (for rotating)
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            // Lights
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 10, 5);
            scene.add(directionalLight);

            // --- Create our simple "3D Signboard" ---

            // Ground (re-named from 'floor')
            const groundGeo = new THREE.PlaneGeometry(20, 20);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x475569 }); // bg-slate-600
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2; // Lay it flat
            ground.name = "ground"; // Important: Name for raycasting
            scene.add(ground);
            clickableObjects.push(ground);

            // Trunk (the pole)
            const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 16); // radiusTop, radiusBottom, height, segments
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x84cc16 }); // bg-lime-500
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 6; // Sit on the ground
            // We don't name it or add it to clickableObjects, so it's not clickable.
            scene.add(trunk);
            
            // --- Helper function to create signs ---
            // This makes it cleaner than repeating code
            function createSign(name, color, yPos, rotation) {
                const signGroup = new THREE.Group(); // Group to hold sign
                
                // Sign board
                const signGeo = new THREE.BoxGeometry(5, 2, 0.2);
                const signMat = new THREE.MeshStandardMaterial({ color: color });
                const sign = new THREE.Mesh(signGeo, signMat);
                sign.name = name; // This is what the raycaster will hit
                signGroup.add(sign);

                // We can't easily add real HTML text in WebGL.
                // For a real app, you'd use a <canvas> texture.
                // For this demo, we'll just make the sign itself clickable.
                
                signGroup.position.y = yPos;
                signGroup.rotation.y = rotation;

                // Move sign "out" from center pole
                sign.position.x = 2.5; 
                
                scene.add(signGroup);
                clickableObjects.push(sign); // Add the sign mesh to be clickable
            }

            // Create the signs
            createSign('sign_welcome', 0x22c55e, 10, 0); // name, color, y-pos, rotation
            createSign('sign_features', 0x3b82f6, 7.5, Math.PI / 2); // Rotated 90 deg
            createSign('sign_about', 0xef4444, 5, Math.PI); // Rotated 180 deg
            createSign('sign_contact', 0xeab308, 2.5, -Math.PI / 2); // Rotated -90 deg
            
            
            // --- 3. RAYCASTING AND CLICK HANDLING ---
            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();

            window.addEventListener('click', onClick);
            window.addEventListener('resize', onWindowResize);
        }

        function onClick(event) {
            
            // --- MODIFIED CLICK LOGIC ---

            // Check if modal is open
            if (!modal.classList.contains('invisible')) {
                // If modal is open, check if the click was *outside* its content
                if (!modalContent.contains(event.target)) {
                    closeModal();
                }
                // Stop further processing whether we closed it or not
                return;
            }

            // --- If modal is closed, proceed with raycasting ---

            // Calculate mouse position in normalized device coordinates
            // (-1 to +1) for both components
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

            // Update the picking ray with the camera and mouse position
            raycaster.setFromCamera(mouse, camera);

            // Calculate objects intersecting the picking ray
            // We only check against our 'clickableObjects' array
            const intersects = raycaster.intersectObjects(clickableObjects);

            if (intersects.length > 0) {
                // Find the first intersecting object
                const firstHit = intersects[0].object;
                
                // --- THIS IS THE KEY ---
                // Get the name and open the modal AT THE CLICK POSITION
                console.log("Clicked on:", firstHit.name);
                openModal(firstHit.name, event.clientX, event.clientY);
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);
            controls.update(); // Update controls
            renderer.render(scene, camera);
        }

        // Start everything
        init();
        animate();