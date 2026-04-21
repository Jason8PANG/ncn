#!/bin/bash

echo "======================================"
echo "  Running NCN All Tests"
echo "======================================"
echo ""

# Run backend tests
echo ">>> Running Backend Tests..."
echo ""
cd ncn-web
npm test
BACKEND_STATUS=$?
cd ..

echo ""
echo "--------------------------------------"
echo ""

# Run frontend tests
echo ">>> Running Frontend Tests..."
echo ""
cd ncn-frontend
npm test
FRONTEND_STATUS=$?
cd ..

echo ""
echo "======================================"
echo "  Test Summary"
echo "======================================"

if [ $BACKEND_STATUS -eq 0 ] && [ $FRONTEND_STATUS -eq 0 ]; then
  echo "  All tests passed!"
  exit 0
else
  echo "  Some tests failed!"
  [ $BACKEND_STATUS -ne 0 ] && echo "  - Backend tests failed"
  [ $FRONTEND_STATUS -ne 0 ] && echo "  - Frontend tests failed"
  exit 1
fi
